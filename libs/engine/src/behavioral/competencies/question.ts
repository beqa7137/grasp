import type { BehavioralQuestion } from '../types.js';

export type QuestionEntry = [prompt: string, probes: string, followUps: [string, string, string]];

export const questions = (competencyId: string, entries: QuestionEntry[]): BehavioralQuestion[] =>
  entries.map(([prompt, probes, followUps], i) => ({ id: `${competencyId}-${i + 1}`, competencyId, prompt, probes, followUps }));
