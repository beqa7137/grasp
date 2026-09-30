import { Logger } from '@nestjs/common';
import { safeErrorDetails } from '../observability/safe-error.js';
import { deadlineExceeded, toHttpError } from './anthropic-errors.js';
import { abortedBy, deadlineAfter, FALLBACK_SCORE_SUMMARY, toClaudeMessages } from './claude.interviewer.js';
import { gatewayCostUsd, maximumGatewayCostUsd, reasoningEffort, type GatewayModel } from './gateway-catalog.js';
import type { GatewayClient, GatewayCompletion } from './gateway-client.js';
import { Interviewer, type ReplyResult, type ScoreResult } from './interviewer.js';
import type { InterviewSession, TokenUsage } from './interview.types.js';
import { meteredRequest } from './metered-request.js';
import { OfflineInterviewer } from './offline.interviewer.js';
import { inputTokenBound } from './pricing.js';
import { InvalidScorecardError } from './scorecard.schema.js';
import type { SpendGuard } from './spend-guard.js';
import {
  normalizeScorecardFor,
  redirectFor,
  scorecardJsonSchemaFor,
  scorerPromptFor,
  scoringRequest,
  systemPromptFor,
} from './track-prompts.js';

export interface GatewayCall {
  operation: 'reply' | 'score';
  usage: TokenUsage;
  billedCostUsd: number | null;
  finishReason: string | null;
}

export interface GatewayInterviewerOptions {
  replyMaxTokens?: number;
  scoreMaxTokens?: number;
  /** Time to the response headers of one try. */
  timeoutMs?: number;
  replyDeadlineMs?: number;
  scoreDeadlineMs?: number;
  maxRetries?: number;
  onCall?: (call: GatewayCall) => void;
}

const SCORE_ATTEMPTS = 2;

/**
 * Any chat model behind the Vercel AI Gateway, given the same system prompts, turns and scorecard schema as Claude,
 * and the same whole-reply and whole-scoring deadlines. Replies ask the gateway to place cache markers
 * (`caching: 'auto'`) for providers that need them; the others cache implicitly.
 */
export class GatewayInterviewer extends Interviewer {
  readonly mode = 'ai' as const;
  /** `text` when the model has no `response_format`: the schema then goes in the prompt and the reply is parsed. */
  readonly scoreFormat: 'json_schema' | 'text';
  readonly replyEffort: string | undefined;
  readonly scoreEffort: string | undefined;
  private readonly log = new Logger(GatewayInterviewer.name);
  private readonly offline = new OfflineInterviewer();
  private readonly replyMaxTokens: number;
  private readonly scoreMaxTokens: number;
  private readonly replyDeadlineMs: number;
  private readonly scoreDeadlineMs: number;
  /** The disclosure names OpenAI, so an OpenAI model is never served by another host the gateway routes to. */
  private readonly pinned: { only?: string[] };

  constructor(
    private readonly client: GatewayClient,
    readonly model: GatewayModel,
    private readonly spend: SpendGuard,
    private readonly options: GatewayInterviewerOptions = {},
  ) {
    super();
    this.scoreFormat = model.structuredOutput ? 'json_schema' : 'text';
    this.replyEffort = reasoningEffort(model, 'low');
    this.scoreEffort = reasoningEffort(model, 'medium');
    this.replyMaxTokens = options.replyMaxTokens ?? 2048;
    this.scoreMaxTokens = options.scoreMaxTokens ?? 16_000;
    this.replyDeadlineMs = options.replyDeadlineMs ?? 90_000;
    this.scoreDeadlineMs = options.scoreDeadlineMs ?? 180_000;
    this.pinned = model.id.startsWith('openai/') ? { only: ['openai'] } : {};
    maximumGatewayCostUsd(model, this.replyMaxTokens, 0);
    maximumGatewayCostUsd(model, this.scoreMaxTokens, 0);
  }

  async reply(session: InterviewSession, onDelta: (text: string) => void, disconnected: AbortSignal): Promise<ReplyResult> {
    const body = {
      model: this.model.id,
      max_tokens: this.replyMaxTokens,
      messages: [{ role: 'system', content: systemPromptFor(session) }, ...toClaudeMessages(session)],
      ...(this.replyEffort ? { reasoning: { effort: this.replyEffort } } : {}),
      providerOptions: { gateway: { caching: 'auto', ...this.pinned } },
    };
    const deadline = deadlineAfter(this.replyDeadlineMs);
    const signal = AbortSignal.any([disconnected, deadline.signal]);
    try {
      const token = await this.client.token(signal, this.options.timeoutMs);
      const completion = await this.metered(this.replyMaxTokens, body, signal, (connected) =>
        this.client.stream(body, onDelta, { token, signal, onConnect: connected, affinity: session.id, timeoutMs: this.options.timeoutMs }),
      );
      const usage = this.record('reply', completion);
      const text = completion.finishReason === 'content_filter' ? '' : completion.text.trim();
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
    const schema = scorecardJsonSchemaFor(session);
    const request =
      this.scoreFormat === 'json_schema'
        ? scoringRequest(session)
        : `${scoringRequest(session)}\n\nReply with only a JSON object, without code fences or other text, that matches this JSON schema:\n${JSON.stringify(schema)}`;
    const body = {
      model: this.model.id,
      max_tokens: this.scoreMaxTokens,
      messages: [
        { role: 'system', content: scorerPromptFor(session) },
        { role: 'user', content: request },
      ],
      ...(this.scoreEffort ? { reasoning: { effort: this.scoreEffort } } : {}),
      ...(this.scoreFormat === 'json_schema'
        ? { response_format: { type: 'json_schema', json_schema: { name: 'scorecard', strict: true, schema } } }
        : {}),
      ...(this.pinned.only ? { providerOptions: { gateway: this.pinned } } : {}),
    };
    const usage: TokenUsage[] = [];
    for (let attempt = 1; attempt <= SCORE_ATTEMPTS; attempt++) {
      let completion: GatewayCompletion;
      try {
        const token = await this.client.token(deadline, this.scoreDeadlineMs);
        completion = await this.metered(this.scoreMaxTokens, body, deadline, () =>
          this.client.complete(body, { token, signal: deadline, timeoutMs: this.scoreDeadlineMs }),
        );
      } catch (err) {
        throw abortedBy(err, deadline) ? deadlineExceeded(this.log, 'interview.score-deadline') : toHttpError(err, this.log);
      }
      usage.push(this.record('score', completion));
      try {
        if (completion.finishReason !== 'stop') throw new InvalidScorecardError(`Scorer stopped with ${completion.finishReason}`);
        const { scorecard, inventedNumbers } = normalizeScorecardFor(session, jsonObject(completion.text));
        return { scorecard: { ...scorecard, mode: 'ai' }, usage, inventedNumbers };
      } catch (err) {
        if (!(err instanceof InvalidScorecardError)) throw err;
        this.log.warn({ operation: 'interview.invalid-scorecard', attempt, ...safeErrorDetails(err) });
      }
    }
    return { scorecard: this.offline.scorecard(session, FALLBACK_SCORE_SUMMARY), usage };
  }

  /** Settles at what the gateway billed when it says, which also covers cache writes chat completions do not report. */
  private metered(maxTokens: number, body: object, signal: AbortSignal, request: (connected: () => void) => Promise<GatewayCompletion>) {
    return meteredRequest({
      spend: this.spend,
      maximumCostUsd: maximumGatewayCostUsd(this.model, maxTokens, inputTokenBound(body)),
      maxRetries: this.options.maxRetries ?? 2,
      signal,
      request,
      costUsd: (completion) => completion.billedCostUsd ?? this.usage(completion).costUsd,
    });
  }

  private record(operation: GatewayCall['operation'], completion: GatewayCompletion): TokenUsage {
    const usage = this.usage(completion);
    this.options.onCall?.({ operation, usage, billedCostUsd: completion.billedCostUsd, finishReason: completion.finishReason });
    return usage;
  }

  /** Chat completions report cache reads inside the prompt count and no cache writes, so writes bill at the input rate. */
  private usage(completion: GatewayCompletion): TokenUsage {
    const u = completion.usage;
    if (!u) return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: null };
    const tokens = {
      inputTokens: u.promptTokens - u.cachedTokens,
      outputTokens: u.completionTokens,
      cacheReadTokens: u.cachedTokens,
      cacheWriteTokens: 0,
    };
    return { ...tokens, costUsd: gatewayCostUsd(this.model, tokens) };
  }
}

/** Models without structured outputs often wrap the object in a code fence or a sentence. */
function jsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}
