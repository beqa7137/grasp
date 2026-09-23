export const FEEDBACK_KINDS = ['bug', 'confusing', 'idea', 'praise'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export interface FeedbackContext {
  route: string;
  release: string | null;
  platform: string;
}

export interface FeedbackEntry {
  id: string;
  learnerId: string;
  kind: FeedbackKind;
  message: string;
  /** 1–5, how useful the app feels right now; optional. */
  rating: number | null;
  context: FeedbackContext;
  createdAt: string;
}
