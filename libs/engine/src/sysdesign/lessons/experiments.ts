/**
 * Lesson widget experiments (REDESIGN.md 4.7): a card sets the widget up in one tap, asks a prediction, plays, then
 * reveals the exact numbers. Every number in the text is a slot the widget's own model fills, so the prose cannot drift
 * from what the widget shows.
 */

export type SlotUnit = 'pct' | 'ms' | 'dur' | 'qps' | 'times' | 's' | 'approx' | 'num' | 'word';

/** A model value with its unit, or a `word` the model chose ("The old value"), which may carry no digits. */
export type Slot = { value: number; unit: Exclude<SlotUnit, 'word'> } | { value: string; unit: 'word' };

export type Slots = Readonly<Record<string, Slot>>;

/** A slot maker for one unit, so a model value reads `ms(run.p99Ms)`. */
export const slotOf =
  (unit: Exclude<SlotUnit, 'word'>) =>
  (value: number): Slot => ({ value, unit });
export const word = (value: string): Slot => ({ value, unit: 'word' });

/** A widget's settings by name, as the experiment applies them. */
export type ExperimentSettings = Readonly<Record<string, number>>;

/** A play a widget runs on the picture, such as loading a page or renaming an author. */
export type ExperimentRun = 'load' | 'rename';

/** What answering plays: new settings (then, if named, a run), a run on its own, or the widget's flush. */
export type ExperimentAct = { set: ExperimentSettings; run?: ExperimentRun } | { run: ExperimentRun } | { flush: true };

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
  /** A challenge: met when the widget's `metric` falls below `below` while the `keep` settings still hold. */
  goal?: ExperimentGoal;
  reveal: string;
  /** The widget regions the reveal is about, pulsed when it plays. */
  focus: readonly string[];
  /** The widget regions hidden while it asks, so the picture does not give the answer away. */
  hide?: readonly string[];
  slots: () => Slots;
}

/** A measure a challenge must bring under a bound. */
export interface ExperimentBound {
  metric: string;
  below: number;
}

/** A challenge's goal: one bound, or `all` of several at once; either way the `keep` settings must still hold. */
export type ExperimentGoal = (ExperimentBound | { all: readonly ExperimentBound[] }) & { keep?: ExperimentSettings };

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
  hide: readonly string[];
  goal?: ExperimentGoal;
}

/** Phrases with digits a template may contain: everything else numeric must be a slot. */
export const TEMPLATE_DIGITS_ALLOWED = ['p99', '100 requests', 'the 99th of 100', 'N+1'] as const;

const trim = (v: number, decimals: number) => String(Number(v.toFixed(decimals)));
/** One formatter for every number: `toLocaleString` with a locale builds a new one on each call. */
const GROUPED = new Intl.NumberFormat('en-US');
const group = (v: number) => GROUPED.format(Math.round(v));

/** Milliseconds as every readout shows them: two decimals under 10 ms, whole above. */
export const formatMs = (v: number) => `${v < 10 ? trim(v, 2) : group(v)} ms`;
export const formatPct = (v: number) => `${trim(v, 1)}%`;
export const formatQps = (v: number) => `${v < 10 ? trim(v, 1) : group(v)}/s`;
export const formatTimes = (v: number) => `${v < 10 ? trim(v, 1) : group(v)}×`;
export const formatSeconds = (v: number) => `${trim(v, 1)} s`;
/** A latency that may run to minutes: milliseconds under a second, then seconds, with a tenth under 100 s. */
export const formatDuration = (ms: number) =>
  ms < 1_000 ? formatMs(ms) : ms < 100_000 ? formatSeconds(ms / 1_000) : `${group(ms / 1_000)} s`;
/** Two significant figures: a modeled count is an estimate, so it is said as one. */
export const formatApprox = (v: number) => {
  if (v < 100) return group(v);
  const step = 10 ** (Math.floor(Math.log10(v)) - 1);
  return group(Math.round(v / step) * step);
};

const FORMAT: Record<Exclude<SlotUnit, 'word'>, (v: number) => string> = {
  pct: formatPct,
  ms: formatMs,
  dur: formatDuration,
  qps: formatQps,
  times: formatTimes,
  s: formatSeconds,
  approx: formatApprox,
  num: (v) => (Number.isInteger(v) ? group(v) : trim(v, 2)),
};

export const formatSlot = (slot: Slot) => (slot.unit === 'word' ? slot.value : FORMAT[slot.unit](slot.value));

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
    hide: spec.hide ?? [],
    goal: spec.goal,
  };
}

/** The digits a template carries outside its slots and the allowed phrases: the reveal spec's check. */
export function strayDigits(template: string): string[] {
  let rest = template.replace(/\{\w+\}/g, '');
  for (const phrase of TEMPLATE_DIGITS_ALLOWED) rest = rest.split(phrase).join('');
  return rest.match(/\d+/g) ?? [];
}

/** Whether the settings a challenge keeps are as it set them. */
export const goalKept = (goal: ExperimentGoal, settings: ExperimentSettings): boolean =>
  Object.entries(goal.keep ?? {}).every(([name, value]) => settings[name] === value);

/** A goal's bounds, one or several. */
export const goalBounds = (goal: ExperimentGoal): readonly ExperimentBound[] => ('all' in goal ? goal.all : [goal]);

/** A challenge is met when every bound's metric is under it and the settings it keeps are as it set them. */
export function goalMet(goal: ExperimentGoal, metrics: Readonly<Record<string, number>>, settings: ExperimentSettings): boolean {
  return goalKept(goal, settings) && goalBounds(goal).every((b) => metrics[b.metric] < b.below);
}

export const experimentTemplates = (spec: ExperimentSpec): string[] => [
  spec.title,
  spec.ask,
  ...(spec.choices ?? []).map((c) => c.text),
  spec.reveal,
];
