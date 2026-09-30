import type { InterviewSession, Scorecard, TokenUsage } from './interview.types.js';

export interface ReplyResult {
  text: string;
  usage?: TokenUsage;
}

export interface ScoreResult {
  scorecard: Scorecard;
  /** One entry per model call; scoring may retry. */
  usage?: TokenUsage[];
  /** Behavioral AI scoring: numbers the scorer invented before they became [number]. For evals; never stored or shown. */
  inventedNumbers?: number;
}

export abstract class Interviewer {
  abstract readonly mode: 'ai' | 'offline';
  abstract reply(session: InterviewSession, onDelta: (text: string) => void, signal: AbortSignal): Promise<ReplyResult>;
  abstract score(session: InterviewSession): Promise<ScoreResult>;
}
