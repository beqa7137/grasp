export const INTERVIEW_TRACKS = ['coding', 'system-design', 'behavioral'] as const;
export type InterviewTrack = (typeof INTERVIEW_TRACKS)[number];

/** Weakest first, so a verdict's index is its level. */
export const VERDICTS = ['no-hire', 'lean-no-hire', 'lean-hire', 'hire', 'strong-hire'] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface RubricDimension {
  name: string;
  lookFor: string;
}

/** What each track's scorecard scores, in order; the interviewers and the loop debrief share it. */
export const INTERVIEW_RUBRICS: Record<InterviewTrack, readonly RubricDimension[]> = {
  coding: [
    { name: 'Problem understanding', lookFor: 'Restates the problem, asks about input size, edge cases and constraints before coding.' },
    { name: 'Approach', lookFor: 'Starts from a baseline, identifies the right pattern, and improves it with a clear rationale.' },
    { name: 'Complexity analysis', lookFor: 'States and justifies time and space complexity correctly, including amortized arguments.' },
    { name: 'Correctness & edge cases', lookFor: 'Walks through an example, handles empty/duplicate/boundary inputs, fixes own bugs.' },
    { name: 'Communication', lookFor: 'Thinks out loud, structures the answer, responds well to hints.' },
  ],
  'system-design': [
    { name: 'Requirements & scope', lookFor: 'Separates functional and non-functional requirements; agrees on scope.' },
    { name: 'Estimation', lookFor: 'Back-of-envelope QPS, storage and bandwidth that drive later decisions.' },
    { name: 'High-level design', lookFor: 'Clear components and data flow; APIs and data model that fit the access patterns.' },
    {
      name: 'Deep dives & trade-offs',
      lookFor: 'Identifies bottlenecks, scaling strategy, failure modes; weighs alternatives explicitly.',
    },
    { name: 'Communication', lookFor: 'Drives the conversation, checks in, adapts to feedback.' },
  ],
  behavioral: [
    { name: 'Competency fit', lookFor: 'A real story that shows the competency the question asks about, told as a clear STAR arc.' },
    {
      name: 'Ownership & specificity',
      lookFor: 'Says what they decided and did themselves, with concrete steps and details rather than "we".',
    },
    { name: 'Impact & results', lookFor: 'A measured or concrete outcome tied to their own actions, including what happened afterwards.' },
    {
      name: 'Judgment & reflection',
      lookFor: 'Explains why they chose what they did, the trade-offs weighed, and what they would change.',
    },
    { name: 'Follow-up handling', lookFor: 'Answers each follow-up directly with new, specific detail instead of repeating the story.' },
  ],
};

export const TRACK_NAMES: Record<InterviewTrack, string> = { coding: 'Coding', 'system-design': 'System design', behavioral: 'Behavioral' };
