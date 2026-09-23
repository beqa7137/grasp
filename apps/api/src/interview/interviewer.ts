import type { InterviewSession, Scorecard } from './interview.types.js';

export abstract class Interviewer {
  abstract readonly mode: 'ai' | 'offline';
  abstract reply(session: InterviewSession, onDelta: (text: string) => void, signal: AbortSignal): Promise<string>;
  abstract score(session: InterviewSession): Promise<Scorecard>;
}
