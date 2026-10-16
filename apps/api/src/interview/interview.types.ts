import type { AnswerFlaw, Seniority, StarDraft } from '@grasp/engine';

export type InterviewTrack = 'coding' | 'system-design' | 'behavioral';
export type InterviewMode = 'ai' | 'offline';
export type AiAccess = 'available' | 'sign-in-required' | 'unavailable';

export interface InterviewProblem {
  id: string;
  track: InterviewTrack;
  title: string;
  opening: string;
  referenceNotes: string;
  patternIds: string[];
  hints: string[];
  /** Behavioral only: the competency the question is about. */
  competencyId?: string;
}

export interface CodeSnapshot {
  language: 'javascript' | 'typescript' | 'python';
  source: string;
}

export interface InterviewMessage {
  role: 'interviewer' | 'candidate';
  content: string;
  at: string;
  hint?: boolean;
  /** Editor contents the candidate shared with this message. */
  code?: CodeSnapshot;
  /** The STAR answer a behavioral interview opens with; `content` holds it as text. */
  star?: StarDraft;
}

export interface ScoreDimension {
  name: string;
  score: number;
  evidence: string;
}

export interface BehavioralFlaw {
  id: AnswerFlaw;
  /** The candidate's own words that show the flaw, verified against the transcript; null when none could be. */
  quote: string | null;
  fix: string;
}

export type Verdict = 'strong-hire' | 'hire' | 'lean-hire' | 'lean-no-hire' | 'no-hire';

export interface Scorecard {
  verdict: Verdict;
  summary: string;
  dimensions: ScoreDimension[];
  strengths: string[];
  improvements: string[];
  weakPatterns: string[];
  mode: 'ai' | 'offline';
  flaws?: BehavioralFlaw[];
  weakCompetencies?: string[];
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Null when the model has no entry in the price table. */
  costUsd: number | null;
}

export interface SessionUsage extends TokenUsage {
  calls: number;
}

export interface InterviewSession {
  id: string;
  learnerId: string;
  track: InterviewTrack;
  problem: InterviewProblem;
  messages: InterviewMessage[];
  hintsUsed: number;
  status: 'active' | 'scored';
  createdAt: string;
  /** Legacy active sessions without a chosen mode use scripted practice. */
  mode?: InterviewMode;
  /** Behavioral only: the career stage the answer is held to; mid-level when absent. */
  level?: Seniority;
  scorecard?: Scorecard;
  scoredAt?: string;
  usage?: SessionUsage;
  /** Set once the session has taken one of the learner's AI rounds this hour, so switching back and forth takes one. */
  aiRound?: true;
}

export interface AiRounds {
  limit: number;
  used: number;
}

export type PublicInterviewSession = Omit<InterviewSession, 'problem' | 'learnerId' | 'usage' | 'aiRound'> & {
  problem: Pick<InterviewProblem, 'id' | 'title' | 'track' | 'patternIds' | 'competencyId'>;
  mode: InterviewMode;
  aiAccess: AiAccess;
};
