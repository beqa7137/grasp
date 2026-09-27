import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import { safeErrorDetails } from '../observability/safe-error.js';
import { toHttpError } from './anthropic-errors.js';
import { Interviewer, type ReplyResult, type ScoreResult } from './interviewer.js';
import type { InterviewSession, TokenUsage } from './interview.types.js';
import { OfflineInterviewer } from './offline.interviewer.js';
import { costUsd } from './pricing.js';
import { candidateTurn, interviewerSystemPrompt, scorerSystemPrompt, transcriptText } from './prompts.js';
import { InvalidScorecardError, normalizeScorecard, scorecardJsonSchema } from './scorecard.schema.js';

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

  constructor(
    private readonly client: Anthropic,
    private readonly options: ClaudeInterviewerOptions,
  ) {
    super();
  }

  async reply(session: InterviewSession, onDelta: (text: string) => void, signal: AbortSignal): Promise<ReplyResult> {
    try {
      const stream = this.client.messages.stream(
        {
          model: this.options.model,
          max_tokens: this.options.replyMaxTokens ?? 2048,
          system: interviewerSystemPrompt(session),
          messages: toClaudeMessages(session),
          cache_control: { type: 'ephemeral' },
          output_config: { effort: 'low' },
        },
        { signal },
      );
      stream.on('text', onDelta);
      const message = await stream.finalMessage();
      const text = message.stop_reason === 'refusal' ? '' : textOf(message);
      if (!text) this.log.warn({ operation: 'interview.empty-reply' });
      return { text: text || REDIRECT_REPLY, usage: this.usage(message.usage) };
    } catch (err) {
      throw toHttpError(err, this.log);
    }
  }

  async score(session: InterviewSession): Promise<ScoreResult> {
    const usage: TokenUsage[] = [];
    for (let attempt = 1; attempt <= SCORE_ATTEMPTS; attempt++) {
      let message: Anthropic.Message;
      try {
        message = await this.client.messages.create(
          {
            model: this.options.model,
            max_tokens: this.options.scoreMaxTokens ?? 16_000,
            system: scorerSystemPrompt(session),
            messages: [{ role: 'user', content: `Score this interview.\n\n<transcript>\n${transcriptText(session)}\n</transcript>` }],
            output_config: { effort: 'medium', format: { type: 'json_schema', schema: scorecardJsonSchema(session.track) } },
          },
          { timeout: this.options.scoreTimeoutMs ?? 180_000 },
        );
      } catch (err) {
        throw toHttpError(err, this.log);
      }
      usage.push(this.usage(message.usage));
      try {
        if (message.stop_reason !== 'end_turn') throw new InvalidScorecardError(`Scorer stopped with ${message.stop_reason}`);
        return { scorecard: { ...normalizeScorecard(session.track, textOf(message)), mode: 'ai' }, usage };
      } catch (err) {
        if (!(err instanceof InvalidScorecardError)) throw err;
        this.log.warn({ operation: 'interview.invalid-scorecard', attempt, ...safeErrorDetails(err) });
      }
    }
    return { scorecard: this.offline.scorecard(session, FALLBACK_SCORE_SUMMARY), usage };
  }

  private usage(u: Anthropic.Usage): TokenUsage {
    const tokens = {
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    };
    return { ...tokens, costUsd: costUsd(this.options.model, tokens) };
  }
}

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
    const content = m.role === 'interviewer' ? m.content : candidateTurn(m);
    const last = out[out.length - 1];
    if (last.role === role) last.content = `${last.content}\n\n${content}`;
    else out.push({ role, content });
  }
  return out;
}
