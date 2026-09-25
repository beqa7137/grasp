/** A Design Lab mission as lists, route titles and progress see it. This module imports no mission content or simulator. */
export interface ScenarioSummary<Id extends string = ScenarioId> {
  id: Id;
  title: string;
  /** How many spaced revisits the mission offers, one per variant. */
  revisits: number;
}

const CATALOG = [
  { id: 'first-scale-up', title: 'Your First Scale-Up', revisits: 3 },
  { id: 'viral-feed', title: 'The Feed Goes Viral', revisits: 3 },
  { id: 'flash-sale', title: 'Flash Sale at Noon', revisits: 3 },
  { id: 'bot-storm', title: 'Bot Storm', revisits: 3 },
  { id: 'write-wall', title: 'The Write Wall', revisits: 3 },
] as const satisfies readonly ScenarioSummary<string>[];

export type ScenarioId = (typeof CATALOG)[number]['id'];

export type ScenarioRevisits = { [S in (typeof CATALOG)[number] as S['id']]: S['revisits'] };

/** Every mission, in the order the Design Lab lists them. */
export const SCENARIO_CATALOG: readonly ScenarioSummary[] = CATALOG;

export function getScenarioSummary(id: string): ScenarioSummary | undefined {
  return SCENARIO_CATALOG.find((s) => s.id === id);
}
