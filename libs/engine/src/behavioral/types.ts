export interface BehavioralQuestion {
  id: string;
  competencyId: string;
  prompt: string;
  /** What the interviewer is really checking with this question, in one sentence. */
  probes: string;
  /** Follow-ups an interviewer asks after the first answer. */
  followUps: readonly string[];
}

export interface Competency {
  id: string;
  /** Why interviewers ask about it and what a hiring committee reads from it. */
  why: string;
  /** What a strong answer shows. */
  strongSignals: readonly string[];
  /** What sinks an answer. */
  redFlags: readonly string[];
  questions: readonly BehavioralQuestion[];
}

export type AnswerFlaw = 'we-not-i' | 'no-result' | 'long-setup' | 'no-reflection' | 'vague' | 'blame';

export interface ExampleAnswer {
  /** The question in the competency's list that this answer responds to. */
  questionId: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
}

/** The career stage an answer speaks from, since the bar for scope and impact rises with it. */
export type Seniority = 'early' | 'mid' | 'senior';

export interface StrongExample extends ExampleAnswer {
  level: Seniority;
  /** Why each part works, in one or two sentences. */
  notes: { situation: string; task: string; action: string; result: string; reflection: string };
}

export interface WeakExample extends ExampleAnswer {
  /** What is wrong with it; the learner tries to spot these before they are shown. */
  flaws: readonly AnswerFlaw[];
  /** Why each flagged flaw hurts this answer. */
  why: Partial<Record<AnswerFlaw, string>>;
  /** How the answer would read once fixed, in two or three sentences. */
  fix: string;
}

export interface CompetencyExamples {
  competencyId: string;
  /** One per career stage, each answering a different question. */
  strong: readonly StrongExample[];
  weak: readonly WeakExample[];
}
