export interface WorkedExample {
  title: string;
  /** The problem, in one or two sentences. */
  problem: string;
  /** The one move that makes the pattern fit this problem. */
  insight: string;
  /** The walkthrough, revealed one step at a time; each step says what happens and why. */
  steps: readonly string[];
  /** The pattern's visualizer and an input for it that replays this example, when one fits. */
  visualize?: { algorithmId: string; input: Record<string, unknown> };
}

export interface Lesson {
  /** Why the pattern is correct: the invariant it keeps, in two or three sentences. */
  why: string;
  examples: readonly WorkedExample[];
  /** How the template changes for common twists. */
  variations: readonly { name: string; how: string }[];
  /** What interviewers ask after a working solution, with a short model answer. */
  followUps: readonly { question: string; answer: string }[];
}
