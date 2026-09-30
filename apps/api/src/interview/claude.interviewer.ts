import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import { safeErrorDetails } from '../observability/safe-error.js';
import { deadlineExceeded, toHttpError } from './anthropic-errors.js';
import { Interviewer, type ReplyResult, type ScoreResult } from './interviewer.js';
import type { InterviewSession, TokenUsage } from './interview.types.js';
import { meteredRequest } from './metered-request.js';
import { OfflineInterviewer } from './offline.interviewer.js';
import { inputTokenBound, maximumCostUsd, messageUsage, priceFor } from './pricing.js';
import { InvalidScorecardError } from './scorecard.schema.js';
import type { SpendGuard } from './spend-guard.js';
import { StreamUsage } from './stream-usage.js';
import {
  candidateTurnFor,
  normalizeScorecardFor,
  redirectFor,
  scorecardJsonSchemaFor,
  scorerPromptFor,
  scoringRequest,
  systemPromptFor,
} from './track-prompts.js';

export { REDIRECT_REPLY } from './track-prompts.js';

export interface ClaudeInterviewerOptions {
  model: string;
  replyMaxTokens?: number;
  scoreMaxTokens?: number;
  replyDeadlineMs?: number;
  scoreDeadlineMs?: number;
}

export const FALLBACK_SCORE_SUMMARY =
  'The AI scorer could not produce a valid scorecard for this interview, so this is the offline heuristic instead. It checks which rubric areas you covered, not whether your answers were right.';
const SCORE_ATTEMPTS = 2;

/**
 * Replies keep system prompt, message prefix and effort identical across turns so automatic prompt
 * caching can reuse the whole conversation prefix; changing any of them per turn would reset the cache.
 */
export class ClaudeInterviewer extends Interviewer {
  readonly mode = 'ai' as const;
  private readonly log = new Logger(ClaudeInterviewer.name);
  private readonly offline = new OfflineInterviewer();
  private readonly model;
  private readonly replyMaxTokens: number;
  private readonly scoreMaxTokens: number;
  private readonly replyDeadlineMs: number;
  private readonly scoreDeadlineMs: number;

  constructor(
    private readonly client: Anthropic,
    options: ClaudeInterviewerOptions,
    private readonly spend: SpendGuard,
  ) {
    super();
    const model = priceFor(options.model);
    if (!model) throw new RangeError('The AI model has no verified pricing and limits.');
    this.model = model;
    this.replyMaxTokens = options.replyMaxTokens ?? 2048;
    this.scoreMaxTokens = options.scoreMaxTokens ?? 16_000;
    this.replyDeadlineMs = options.replyDeadlineMs ?? 90_000;
    this.scoreDeadlineMs = options.scoreDeadlineMs ?? 180_000;
    maximumCostUsd(model.model, this.replyMaxTokens, true);
    maximumCostUsd(model.model, this.scoreMaxTokens, false);
  }

  async reply(session: InterviewSession, onDelta: (text: string) => void, disconnected: AbortSignal): Promise<ReplyResult> {
    const deadline = deadlineAfter(this.replyDeadlineMs);
    const signal = AbortSignal.any([disconnected, deadline.signal]);
    try {
      const params: Anthropic.MessageCreateParams = {
        model: this.model.model,
        max_tokens: this.replyMaxTokens,
        system: systemPromptFor(session),
        messages: toClaudeMessages(session),
        cache_control: { type: 'ephemeral', ttl: '5m' },
        service_tier: 'standard_only',
        ...(this.model.supportsEffort ? { output_config: { effort: 'low' } } : {}),
      };
      let streamUsage: StreamUsage | undefined;
      const { message, usage } = await meteredRequest({
        spend: this.spend,
        maximumCostUsd: maximumCostUsd(this.model.model, this.replyMaxTokens, true, inputTokenBound(params)),
        maxRetries: this.client.maxRetries,
        signal,
        request: async (connected) => {
          streamUsage = new StreamUsage(this.model.model, this.replyMaxTokens);
          const attempt = streamUsage;
          const stream = this.client.messages.stream(params, { signal, maxRetries: 0 });
          stream.on('connect', connected);
          stream.on('text', onDelta);
          stream.on('streamEvent', (event) => attempt.observe(event));
          const final = await stream.finalMessage();
          const finalUsage = messageUsage(this.model.model, this.replyMaxTokens, true, final);
          return { message: final, usage: attempt.supported ? finalUsage : { ...finalUsage, costUsd: null } };
        },
        costUsd: (result) => result.usage.costUsd,
        costBoundAfterStart: () => streamUsage?.costBoundUsd() ?? null,
      });
      const text = message.stop_reason === 'refusal' ? '' : textOf(message);
      if (!text) this.log.warn({ operation: 'interview.empty-reply' });
      return { text: text || redirectFor(session), usage };
    } catch (err) {
      throw abortedBy(err, deadline.signal) && !disconnected.aborted
        ? deadlineExceeded(this.log, 'interview.reply-deadline')
        : toHttpError(err, this.log);
    } finally {
      deadline.clear();
    }
  }

  async score(session: InterviewSession): Promise<ScoreResult> {
    const deadline = deadlineAfter(this.scoreDeadlineMs);
    try {
      return await this.scoreWithin(session, deadline.signal);
    } finally {
      deadline.clear();
    }
  }

  private async scoreWithin(session: InterviewSession, deadline: AbortSignal): Promise<ScoreResult> {
    const usage: TokenUsage[] = [];
    for (let attempt = 1; attempt <= SCORE_ATTEMPTS; attempt++) {
      let message: Anthropic.Message;
      try {
        const params: Anthropic.MessageCreateParamsNonStreaming = {
          model: this.model.model,
          max_tokens: this.scoreMaxTokens,
          system: scorerPromptFor(session),
          messages: [{ role: 'user', content: scoringRequest(session) }],
          service_tier: 'standard_only',
          output_config: {
            ...(this.model.supportsEffort ? { effort: 'medium' } : {}),
            format: { type: 'json_schema', schema: scorecardJsonSchemaFor(session) },
          },
        };
        message = await meteredRequest({
          spend: this.spend,
          maximumCostUsd: maximumCostUsd(this.model.model, this.scoreMaxTokens, false, inputTokenBound(params)),
          maxRetries: this.client.maxRetries,
          signal: deadline,
          request: async () => this.client.messages.create(params, { timeout: this.scoreDeadlineMs, maxRetries: 0, signal: deadline }),
          costUsd: (result) => messageUsage(this.model.model, this.scoreMaxTokens, false, result).costUsd,
        });
      } catch (err) {
        throw abortedBy(err, deadline) ? deadlineExceeded(this.log, 'interview.score-deadline') : toHttpError(err, this.log);
      }
      usage.push(messageUsage(this.model.model, this.scoreMaxTokens, false, message));
      try {
        if (message.stop_reason !== 'end_turn') throw new InvalidScorecardError(`Scorer stopped with ${message.stop_reason}`);
        const { scorecard, inventedNumbers } = normalizeScorecardFor(session, textOf(message));
        return { scorecard: { ...scorecard, mode: 'ai' }, usage, inventedNumbers };
      } catch (err) {
        if (!(err instanceof InvalidScorecardError)) throw err;
        this.log.warn({ operation: 'interview.invalid-scorecard', attempt, ...safeErrorDetails(err) });
      }
    }
    return { scorecard: this.offline.scorecard(session, FALLBACK_SCORE_SUMMARY), usage };
  }
}

/** The SDK timeout only covers the wait for response headers, so a stream that keeps trickling tokens needs its own bound. */
export function deadlineAfter(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

export const abortedBy = (err: unknown, signal: AbortSignal) => err instanceof Anthropic.APIUserAbortError && signal.aborted;

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

/**
 * Claude needs alternating turns that start with the user, so the interviewer's scripted opening is
 * preceded by a synthetic join message. Consecutive same-role turns (a retried candidate message) merge.
 */
export function toClaudeMessages(session: InterviewSession): Anthropic.MessageParam[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [{ role: 'user', content: '(The candidate joins the call.)' }];
  for (const m of session.messages) {
    const role = m.role === 'interviewer' ? 'assistant' : 'user';
    const content = m.role === 'interviewer' ? m.content : candidateTurnFor(session, m);
    const last = out[out.length - 1];
    if (last.role === role) last.content = `${last.content}\n\n${content}`;
    else out.push({ role, content });
  }
  return out;
}
