export type InterviewTrack = 'coding' | 'system-design';

export interface InterviewProblem {
  id: string;
  track: InterviewTrack;
  title: string;
  opening: string;
  referenceNotes: string;
  patternIds: string[];
  hints: string[];
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
}

export interface ScoreDimension {
  name: string;
  score: number;
  evidence: string;
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
  scorecard?: Scorecard;
  scoredAt?: string;
  usage?: SessionUsage;
}

export type PublicInterviewSession = Omit<InterviewSession, 'problem' | 'learnerId' | 'usage'> & {
  problem: Pick<InterviewProblem, 'id' | 'title' | 'track' | 'patternIds'>;
  mode: 'ai' | 'offline';
};
