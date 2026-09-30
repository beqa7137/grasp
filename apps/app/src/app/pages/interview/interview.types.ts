import type { AnswerFlaw, StarDraft } from '@grasp/engine';

export type InterviewTrack = 'coding' | 'system-design' | 'behavioral';
export type InterviewMode = 'ai' | 'offline';
export type AiAccess = 'available' | 'sign-in-required' | 'unavailable';

export interface InterviewCatalog {
  aiAccess: AiAccess;
  problems: ProblemSummary[];
}

export interface ProblemSummary {
  id: string;
  track: InterviewTrack;
  title: string;
  patternIds: string[];
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
  code?: CodeSnapshot;
  star?: StarDraft;
}

export interface BehavioralFlaw {
  id: AnswerFlaw;
  quote: string | null;
  fix: string;
}

export interface Scorecard {
  verdict: 'strong-hire' | 'hire' | 'lean-hire' | 'lean-no-hire' | 'no-hire';
  summary: string;
  dimensions: { name: string; score: number; evidence: string }[];
  strengths: string[];
  improvements: string[];
  weakPatterns: string[];
  mode: InterviewMode;
  flaws?: BehavioralFlaw[];
  weakCompetencies?: string[];
}

export interface InterviewSession {
  id: string;
  track: InterviewTrack;
  problem: ProblemSummary;
  messages: InterviewMessage[];
  hintsUsed: number;
  status: 'active' | 'scored';
  createdAt: string;
  scorecard?: Scorecard;
  scoredAt?: string;
  mode: InterviewMode;
  aiAccess: AiAccess;
}

/** A behavioral interview asks up to this many follow-ups; the server closes it after the answer to the last one. */
export const BEHAVIORAL_FOLLOW_UPS = 3;
