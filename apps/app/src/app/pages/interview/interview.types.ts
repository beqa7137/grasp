export type InterviewTrack = 'coding' | 'system-design';

export interface ProblemSummary {
  id: string;
  track: InterviewTrack;
  title: string;
  patternIds: string[];
}

export interface InterviewMessage {
  role: 'interviewer' | 'candidate';
  content: string;
  at: string;
  hint?: boolean;
}

export interface Scorecard {
  verdict: 'strong-hire' | 'hire' | 'lean-hire' | 'lean-no-hire' | 'no-hire';
  summary: string;
  dimensions: { name: string; score: number; evidence: string }[];
  strengths: string[];
  improvements: string[];
  weakPatterns: string[];
  mode: 'ai' | 'offline';
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
  mode: 'ai' | 'offline';
}
