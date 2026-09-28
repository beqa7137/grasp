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
