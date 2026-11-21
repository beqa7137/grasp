/**
 * Text widths for the lesson widgets' stages, so a layout decides its fallbacks and collisions the same way in the
 * browser and in specs (which have no canvas). A widget names its type roles; `fontMeasure` measures them by Inter
 * Variable's per-character advances, in 1/10,000 em, measured with canvas `measureText` from the font files the app
 * ships (JetBrains Mono Variable is 0.6 em, but for the arrow, which its latin subset lacks), and `fixedMeasure` by one
 * advance per role. Stage text never uses tabular digits, so these advances are the ones drawn.
 */

export type Face = 'w500' | 'w600' | 'w700' | 'mono';

/** A type role: its face and size, letter-spacing in em, and whether it is set in capitals. */
export interface RoleSpec {
  font: Face;
  size: number;
  track?: number;
  upper?: boolean;
  /** In capitals, but a unit after a number keeps its SI case ("400 ms"), as a `t-unit` span draws it. */
  units?: boolean;
}

/** One run of a text line: its words, role, color class and an offset before it. */
export type Part<R extends string = string> = readonly [text: string, role: R, cls?: string, dx?: number];

export interface TextMeasure<R extends string> {
  /** A text's width in px as the stage draws it in `role`. */
  tw(text: string, role: R): number;
  size(role: R): number;
  partsWidth(parts: readonly Part<R>[]): number;
  /**
   * Breaks `text` at spaces into lines no wider than `width`, never between a number and its unit ("25 ms"), nor inside
   * a match of a `keep` pattern (each global); a word wider than it keeps its own line. With a `lines` limit the last
   * line takes what is left, even of an empty text.
   */
  wrap(text: string, role: R, width: number, lines?: number, keep?: readonly RegExp[]): string[];
}

/** Printable ASCII from the space, then these. */
const EXTRA = '·→–×✓’…';
const INTER: Record<'w500' | 'w600' | 'w700', readonly number[]> = {
  w500: [
    2666, 3042, 4941, 6387, 6460, 9932, 6533, 3130, 3687, 3687, 5205, 6675, 3032, 4624, 3032, 3696, 6455, 4150, 6162, 6270, 6563, 6030,
    6299, 5713, 6294, 6299, 3032, 3154, 6675, 6675, 6675, 5273, 9824, 7090, 6567, 7334, 7217, 6030, 5894, 7476, 7446, 2725, 5752, 6875,
    5654, 9126, 7563, 7666, 6416, 7686, 6479, 6460, 6528, 7402, 7090, 10029, 7007, 6963, 6406, 3687, 3696, 3687, 4766, 4629, 3369, 5679,
    6182, 5771, 6182, 5874, 3794, 6196, 6016, 2520, 2520, 5591, 2520, 8882, 6016, 6040, 6182, 6182, 3867, 5386, 3403, 6016, 5747, 8291,
    5571, 5752, 5591, 4404, 3457, 4404, 6675, 3032, 10000, 5000, 6675, 8843, 2773, 9102,
  ],
  w600: [
    2520, 3213, 5229, 6436, 6504, 10044, 6626, 3257, 3730, 3730, 5396, 6729, 3188, 4653, 3188, 3789, 6597, 4229, 6230, 6362, 6660, 6123,
    6396, 5762, 6401, 6396, 3188, 3291, 6729, 6729, 6729, 5435, 9990, 7275, 6592, 7368, 7222, 6055, 5879, 7490, 7456, 2769, 5796, 7031,
    5654, 9224, 7593, 7686, 6450, 7729, 6523, 6504, 6602, 7358, 7275, 10200, 7197, 7134, 6523, 3730, 3789, 3730, 4814, 4692, 3511, 5742,
    6240, 5825, 6240, 5913, 3887, 6255, 6123, 2617, 2617, 5693, 2617, 9004, 6118, 6089, 6240, 6240, 3970, 5493, 3530, 6123, 5869, 8394,
    5688, 5884, 5659, 4546, 3589, 4546, 6729, 3188, 10000, 5000, 6729, 8843, 2939, 9561,
  ],
  w700: [
    2368, 3379, 5518, 6489, 6548, 10156, 6719, 3389, 3770, 3770, 5591, 6787, 3340, 4678, 3340, 3882, 6743, 4312, 6299, 6455, 6763, 6221,
    6494, 5815, 6509, 6494, 3340, 3428, 6787, 6787, 6787, 5596, 10161, 7466, 6616, 7397, 7222, 6074, 5869, 7505, 7471, 2808, 5845, 7192,
    5654, 9316, 7622, 7705, 6479, 7769, 6567, 6548, 6675, 7319, 7466, 10376, 7383, 7310, 6641, 3770, 3882, 3770, 4868, 4761, 3652, 5806,
    6304, 5884, 6304, 5957, 3979, 6318, 6226, 2710, 2710, 5801, 2710, 9126, 6226, 6133, 6304, 6304, 4072, 5601, 3662, 6226, 5996, 8501,
    5801, 6021, 5728, 4688, 3716, 4688, 6787, 3340, 10000, 5000, 6787, 8843, 3105, 10020,
  ],
};
const MONO_ARROW = 10000;

const advance = (font: Face, ch: string) => {
  const code = ch.charCodeAt(0);
  const i = code >= 32 && code < 127 ? code - 32 : 95 + EXTRA.indexOf(ch);
  if (font === 'mono') return ch === '→' ? MONO_ARROW : 6000;
  return INTER[font][i] ?? INTER[font][0x4d - 32];
};

const UNIT_AFTER_NUMBER = /(?<=\d )(MB\/s|ms|s)\b/;
/** The spaces a line may break at: any but the one between a number and its unit. */
const BREAK = / (?!(?<=\d )(?:MB\/s|ms|s)\b)/;
/** A private-use character holds a kept space while a text is split. */
const HOLD = '\ue000';

/** A label's runs: a unit after a number apart, so it can keep its case in capitals. */
export const unitRuns = (text: string): [text: string, unit: boolean][] =>
  text
    .split(UNIT_AFTER_NUMBER)
    .map((t, i): [string, boolean] => [t, i % 2 === 1])
    .filter(([t]) => t);

const capitals = (text: string, units: boolean) =>
  units
    ? unitRuns(text)
        .map(([t, unit]) => (unit ? t : t.toUpperCase()))
        .join('')
    : text.toUpperCase();

function measure<R extends string>(width: (text: string, role: R) => number, size: (role: R) => number): TextMeasure<R> {
  const cache = new Map<string, number>();
  const tw = (text: string, role: R) => {
    const key = `${role}|${text}`;
    let w = cache.get(key);
    if (w === undefined) cache.set(key, (w = width(text, role)));
    return w;
  };
  return {
    tw,
    size,
    partsWidth: (parts) => parts.reduce((s, [t, role, , dx = 0]) => s + tw(t, role) + dx, 0),
    wrap(text, role, limit, lines = Infinity, keep = []) {
      const held = keep.reduce((t, re) => t.replace(re, (m) => m.replaceAll(' ', HOLD)), text);
      const out: string[] = [];
      let line = '';
      for (const word of held.split(BREAK)) {
        const next = line ? `${line} ${word}` : word;
        if (line && tw(next.replaceAll(HOLD, ' '), role) > limit && out.length < lines - 1) {
          out.push(line);
          line = word;
        } else line = next;
      }
      return (line || lines !== Infinity ? [...out, line] : out).map((l) => l.replaceAll(HOLD, ' '));
    },
  };
}

/** Widths by the shipped fonts' advances, rounded up a pixel, for roles as a widget's stylesheet sets them. */
export function fontMeasure<R extends string>(roles: Readonly<Record<R, RoleSpec>>): TextMeasure<R> {
  return measure<R>(
    (text, role) => {
      const r = roles[role];
      const s = r.upper ? capitals(text, !!r.units) : text;
      let units = 0;
      for (const ch of s) units += advance(r.font, ch);
      return Math.ceil((units * r.size) / 10_000 + (r.track ?? 0) * r.size * s.length) + 1;
    },
    (role) => roles[role].size,
  );
}

/** Widths by one advance per role, in px per character. */
export function fixedMeasure<R extends string>(advances: Readonly<Record<R, number>>, sizes: Readonly<Record<R, number>>): TextMeasure<R> {
  return measure<R>(
    (text, role) => text.length * advances[role],
    (role) => sizes[role],
  );
}
