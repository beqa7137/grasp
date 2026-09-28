/** A competency as lists and route titles see it; its guide and questions live in competencies.ts. */
export interface CompetencySummary {
  id: string;
  name: string;
  oneLiner: string;
}

export const COMPETENCY_CATALOG: readonly CompetencySummary[] = [
  { id: 'ownership', name: 'Ownership', oneLiner: 'Acting like the outcome is yours, beyond the edges of your task.' },
  { id: 'delivery', name: 'Delivering Results', oneLiner: 'Shipping what matters on time, and saying early when you cannot.' },
  { id: 'ambiguity', name: 'Ambiguity', oneLiner: 'Making progress when the problem, the goal or the owner is unclear.' },
  { id: 'conflict', name: 'Conflict & Disagreement', oneLiner: 'Disagreeing on the merits, then committing to the decision.' },
  { id: 'influence', name: 'Influence Without Authority', oneLiner: 'Getting people who do not report to you to change course.' },
  { id: 'failure', name: 'Failure & Learning', oneLiner: 'A real mistake, what it cost, and what you changed afterward.' },
  { id: 'customer', name: 'Customer Focus', oneLiner: 'Working backwards from what users need, not what is easy to build.' },
  { id: 'leadership', name: 'Leadership & Mentoring', oneLiner: 'Raising the people and the bar around you.' },
  { id: 'tradeoffs', name: 'Prioritization & Trade-offs', oneLiner: 'Choosing what not to do, and defending the choice with data.' },
  { id: 'technical-depth', name: 'Technical Depth', oneLiner: 'The hardest problem you solved, told so an engineer believes it.' },
];

export function getCompetencySummary(id: string): CompetencySummary | undefined {
  return COMPETENCY_CATALOG.find((c) => c.id === id);
}
