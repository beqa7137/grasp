/**
 * Text widths for the Consistency & Quorums stage, so its layout decides fallbacks and collisions the same way in the
 * browser and in specs (which have no canvas). Advances are Inter Variable's, per character in 1/10,000 em, measured with
 * canvas `measureText` from the font files the app ships; JetBrains Mono Variable is 0.6 em, but for the arrow, which
 * its latin subset lacks.
 */

/** The stage's type roles, as `quorum-widget.component.scss` sets them. */
export type Role = 'label' | 'cap' | 'capB' | 'small' | 'smallB' | 'mono' | 'name' | 'nameS' | 'head' | 'pill';

const ROLES: Record<Role, { font: 'w500' | 'w600' | 'w700' | 'mono'; size: number; track?: number; upper?: boolean }> = {
  label: { font: 'w600', size: 11, track: 0.12, upper: true },
  cap: { font: 'w500', size: 13 },
  capB: { font: 'w600', size: 13 },
  small: { font: 'w500', size: 11 },
  smallB: { font: 'w700', size: 11 },
  mono: { font: 'mono', size: 11 },
  name: { font: 'mono', size: 15 },
  nameS: { font: 'mono', size: 13 },
  head: { font: 'mono', size: 17 },
  pill: { font: 'w600', size: 13 },
};

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

const advance = (font: 'w500' | 'w600' | 'w700' | 'mono', ch: string) => {
  const code = ch.charCodeAt(0);
  const i = code >= 32 && code < 127 ? code - 32 : 95 + EXTRA.indexOf(ch);
  if (font === 'mono') return ch === '→' ? MONO_ARROW : 6000;
  return INTER[font][i] ?? INTER[font][0x4d - 32];
};

export const roleSize = (role: Role) => ROLES[role].size;

const cache = new Map<string, number>();

/** A text's width in px, rounded up a pixel, as the stage draws it in `role`. */
export function tw(text: string, role: Role): number {
  const key = `${role}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const r = ROLES[role];
  const s = r.upper ? text.toUpperCase() : text;
  let units = 0;
  for (const ch of s) units += advance(r.font, ch);
  const width = Math.ceil((units * r.size) / 10_000 + (r.track ?? 0) * r.size * s.length) + 1;
  cache.set(key, width);
  return width;
}

/** One run of a text line: its words, role, colour class and an offset before it. */
export type Part = readonly [text: string, role: Role, cls?: string, dx?: number];

export const partsWidth = (parts: readonly Part[]) => parts.reduce((s, [t, role, , dx = 0]) => s + tw(t, role) + dx, 0);

/** Breaks `text` at spaces into lines no wider than `width`; a single word wider than it keeps its own line. */
export function wrap(text: string, role: Role, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (tw(next, role) <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
