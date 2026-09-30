import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import { safeErrorDetails } from '../observability/safe-error.js';
import { toHttpError } from './anthropic-errors.js';
import { Interviewer, type ReplyResult, type ScoreResult } from './interviewer.js';
import type { InterviewSession, TokenUsage } from './interview.types.js';
import { meteredRequest } from './metered-request.js';
import { OfflineInterviewer } from './offline.interviewer.js';
import { inputTokenBound, maximumCostUsd, messageUsage, priceFor } from './pricing.js';
import { behavioralInterviewerPrompt, behavioralScorerPrompt, behavioralTranscript, behavioralTurn } from './behavioral.prompts.js';
import { behavioralScorecardJsonSchema, normalizeBehavioralScorecard } from './behavioral.scorecard.js';
import { candidateTurn, interviewerSystemPrompt, scorerSystemPrompt, transcriptText } from './prompts.js';
import { InvalidScorecardError, normalizeScorecard, scorecardJsonSchema } from './scorecard.schema.js';
import type { SpendGuard } from './spend-guard.js';
import { StreamUsage } from './stream-usage.js';

export interface ClaudeInterviewerOptions {
  model: string;
  replyMaxTokens?: number;
  scoreMaxTokens?: number;
  scoreTimeoutMs?: number;
}

export const REDIRECT_REPLY = "Let's keep going with the problem. Could you walk me through where your approach stands right now?";
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

  constructor(
    private readonly client: Anthropic,
    private readonly options: ClaudeInterviewerOptions,
    private readonly spend: SpendGuard,
  ) {
    super();
    const model = priceFor(options.model);
    if (!model) throw new RangeError('The AI model has no verified pricing and limits.');
    this.model = model;
    this.replyMaxTokens = options.replyMaxTokens ?? 2048;
    this.scoreMaxTokens = options.scoreMaxTokens ?? 16_000;
    maximumCostUsd(model.model, this.replyMaxTokens, true);
    maximumCostUsd(model.model, this.scoreMaxTokens, false);
  }

  async reply(session: InterviewSession, onDelta: (text: string) => void, signal: AbortSignal): Promise<ReplyResult> {
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
      return { text: text || REDIRECT_REPLY, usage };
    } catch (err) {
      throw toHttpError(err, this.log);
    }
  }

  async score(session: InterviewSession): Promise<ScoreResult> {
    const usage: TokenUsage[] = [];
    for (let attempt = 1; attempt <= SCORE_ATTEMPTS; attempt++) {
      let message: Anthropic.Message;
      try {
        const params: Anthropic.MessageCreateParamsNonStreaming = {
          model: this.model.model,
          max_tokens: this.scoreMaxTokens,
          system: scorerPromptFor(session),
          messages: [{ role: 'user', content: `Score this interview.\n\n<transcript>\n${transcriptFor(session)}\n</transcript>` }],
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
          request: async () => this.client.messages.create(params, { timeout: this.options.scoreTimeoutMs ?? 180_000, maxRetries: 0 }),
          costUsd: (result) => messageUsage(this.model.model, this.scoreMaxTokens, false, result).costUsd,
        });
      } catch (err) {
        throw toHttpError(err, this.log);
      }
      usage.push(messageUsage(this.model.model, this.scoreMaxTokens, false, message));
      try {
        if (message.stop_reason !== 'end_turn') throw new InvalidScorecardError(`Scorer stopped with ${message.stop_reason}`);
        return { scorecard: { ...normalizeScorecardFor(session, textOf(message)), mode: 'ai' }, usage };
      } catch (err) {
        if (!(err instanceof InvalidScorecardError)) throw err;
        this.log.warn({ operation: 'interview.invalid-scorecard', attempt, ...safeErrorDetails(err) });
      }
    }
    return { scorecard: this.offline.scorecard(session, FALLBACK_SCORE_SUMMARY), usage };
  }
}

const behavioral = (session: InterviewSession) => session.track === 'behavioral';
const systemPromptFor = (s: InterviewSession) => (behavioral(s) ? behavioralInterviewerPrompt(s) : interviewerSystemPrompt(s));
const scorerPromptFor = (s: InterviewSession) => (behavioral(s) ? behavioralScorerPrompt(s) : scorerSystemPrompt(s));
const transcriptFor = (s: InterviewSession) => (behavioral(s) ? behavioralTranscript(s) : transcriptText(s));
const scorecardJsonSchemaFor = (s: InterviewSession) => (behavioral(s) ? behavioralScorecardJsonSchema() : scorecardJsonSchema(s.track));
const normalizeScorecardFor = (s: InterviewSession, json: string) =>
  behavioral(s) ? normalizeBehavioralScorecard(s, json) : normalizeScorecard(s.track, json);

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
    const content = m.role === 'interviewer' ? m.content : behavioral(session) ? behavioralTurn(m) : candidateTurn(m);
    const last = out[out.length - 1];
    if (last.role === role) last.content = `${last.content}\n\n${content}`;
    else out.push({ role, content });
  }
  return out;
}
