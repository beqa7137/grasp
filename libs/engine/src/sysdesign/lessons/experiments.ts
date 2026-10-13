/**
 * Lesson widget experiments (REDESIGN.md 4.7): a card sets the widget up in one tap, asks a prediction, plays, then
 * reveals the exact numbers. Every number in the text is a slot the widget's own model fills, so the prose cannot drift
 * from what the widget shows.
 */

export type SlotUnit = 'pct' | 'ms' | 'qps' | 'times' | 's' | 'approx' | 'num';

export interface Slot {
  value: number;
  unit: SlotUnit;
}

export type Slots = Readonly<Record<string, Slot>>;

/** A widget's settings by name, as the experiment applies them. */
export type ExperimentSettings = Readonly<Record<string, number>>;

/** What answering plays: new settings, or the widget's flush. */
export type ExperimentAct = { set: ExperimentSettings } | { flush: true };

/** An experiment as authored: templates with `{slot}` placeholders, and the model values that fill them. */
export interface ExperimentSpec {
  id: string;
  title: string;
  setup: ExperimentSettings;
  act?: ExperimentAct;
  /** The prediction, or for a challenge the goal to reach. */
  ask: string;
  /** Each choice names the slot it stands for; the one equal to `truth` is the answer. Absent for a challenge. */
  choices?: readonly { text: string; value: string }[];
  truth?: string;
  /** A challenge: met when the widget's `metric` falls below `below`. */
  goal?: { metric: string; below: number };
  reveal: string;
  /** The widget regions the reveal is about, pulsed when it plays. */
  focus: readonly string[];
  slots: () => Slots;
}

/** An experiment ready to show: every slot filled, and the answer found from the model. */
export interface SdExperiment {
  id: string;
  title: string;
  setup: ExperimentSettings;
  act?: ExperimentAct;
  ask: string;
  choices: string[];
  /** Index of the right choice; -1 for a challenge. */
  answer: number;
  reveal: string;
  focus: readonly string[];
  goal?: { metric: string; below: number };
}

/** Phrases with digits a template may contain: everything else numeric must be a slot. */
export const TEMPLATE_DIGITS_ALLOWED = ['p99', '100 requests', 'the 99th of 100'] as const;

const trim = (v: number, decimals: number) => String(Number(v.toFixed(decimals)));
const group = (v: number) => Math.round(v).toLocaleString('en-US');

/** Milliseconds as every readout shows them: two decimals under 10 ms, whole above. */
export const formatMs = (v: number) => `${v < 10 ? trim(v, 2) : group(v)} ms`;
export const formatPct = (v: number) => `${trim(v, 1)}%`;
export const formatQps = (v: number) => `${v < 10 ? trim(v, 1) : group(v)}/s`;
export const formatTimes = (v: number) => `${v < 10 ? trim(v, 1) : group(v)}×`;
export const formatSeconds = (v: number) => `${trim(v, 1)} s`;
/** Two significant figures: a modelled count is an estimate, so it is said as one. */
export const formatApprox = (v: number) => {
  if (v < 100) return group(v);
  const step = 10 ** (Math.floor(Math.log10(v)) - 1);
  return group(Math.round(v / step) * step);
};

const FORMAT: Record<SlotUnit, (v: number) => string> = {
  pct: formatPct,
  ms: formatMs,
  qps: formatQps,
  times: formatTimes,
  s: formatSeconds,
  approx: formatApprox,
  num: (v) => trim(v, 2),
};

export const formatSlot = (slot: Slot) => FORMAT[slot.unit](slot.value);

/** Fills `{name}` placeholders; a name with no slot throws, so a typo fails the spec instead of reaching a learner. */
export function fillTemplate(template: string, slots: Slots): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const slot = slots[name];
    if (!slot) throw new Error(`No slot "${name}" for "${template}"`);
    return formatSlot(slot);
  });
}

export function renderExperiment(spec: ExperimentSpec): SdExperiment {
  const slots = spec.slots();
  const fill = (t: string) => fillTemplate(t, slots);
  const choices = (spec.choices ?? []).map((c) => fill(c.text));
  let answer = -1;
  if (spec.choices && spec.truth) {
    const truth = fill(`{${spec.truth}}`);
    const matches = spec.choices.flatMap((c, i) => (fill(`{${c.value}}`) === truth ? [i] : []));
    if (matches.length !== 1) throw new Error(`${spec.id}: ${matches.length} choices equal the model's ${truth}`);
    answer = matches[0];
  }
  return {
    id: spec.id,
    title: fill(spec.title),
    setup: spec.setup,
    act: spec.act,
    ask: fill(spec.ask),
    choices,
    answer,
    reveal: fill(spec.reveal),
    focus: spec.focus,
    goal: spec.goal,
  };
}

/** The digits a template carries outside its slots and the allowed phrases: the reveal spec's check. */
export function strayDigits(template: string): string[] {
  let rest = template.replace(/\{\w+\}/g, '');
  for (const phrase of TEMPLATE_DIGITS_ALLOWED) rest = rest.split(phrase).join('');
  return rest.match(/\d+/g) ?? [];
}

export const experimentTemplates = (spec: ExperimentSpec): string[] => [
  spec.title,
  spec.ask,
  ...(spec.choices ?? []).map((c) => c.text),
  spec.reveal,
];
