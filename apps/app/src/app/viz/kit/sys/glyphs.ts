import type { ComponentKind, RoleGlyph } from '@grasp/engine';

/** A node's glyph: its kind's, or a role a case gives it (REDESIGN.md 4.6). */
export type SysGlyph = ComponentKind | RoleGlyph;

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/** Each glyph's strokes on a 24-unit square, drawn in the node's ink. */
export const GLYPHS: Record<SysGlyph, readonly string[]> = {
  client: [circle(12, 7.5, 3.5), 'M5 20.5c0-3.9 3.1-7 7-7s7 3.1 7 7'],
  cdn: [circle(12, 12, 8.5), 'M3.5 12h17', 'M12 3.5c-3 2.7-3 14.3 0 17', 'M12 3.5c3 2.7 3 14.3 0 17'],
  limiter: ['M5 20.5V4.5', 'M19 20.5V4.5', 'M5 8.5h14', 'M5 14h14', 'M9.5 8.5v5.5', 'M14.5 8.5v5.5'],
  lb: [
    circle(5, 12, 2),
    'M7 12h3',
    'M10 12l9-6.5',
    'M10 12h9',
    'M10 12l9 6.5',
    'M16.5 4.5l2.5 1-1 2.4',
    'M17 10.5l2 1.5-2 1.5',
    'M16.5 19.5l2.5-1-1-2.4',
  ],
  app: ['M4 9h12v11H4z', 'M7 6h12v11', 'M10 3h11v11', 'M7 13h6', 'M7 16h4'],
  cache: ['M5 5h14v14H5z', 'M13 7.5l-4 5h4l-2 4'],
  db: [
    'M5 6.5c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z',
    'M5 6.5v11c0 1.7 3.1 3 7 3s7-1.3 7-3v-11',
    'M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3',
  ],
  replica: [
    'M3 7c0-1.4 2.2-2.5 5-2.5s5 1.1 5 2.5-2.2 2.5-5 2.5S3 8.4 3 7z',
    'M3 7v10c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7',
    'M15.5 9.5h6',
    'M19.5 7.5l2 2-2 2',
    'M21.5 15.5h-6',
    'M17.5 13.5l-2 2 2 2',
  ],
  queue: ['M2.5 7h19v10h-19z', 'M7.5 7v10', 'M12 7v10', 'M16.5 7v10'],
  worker: [
    circle(12, 12, 5.5),
    circle(12, 12, 2),
    'M12 3v3',
    'M12 18v3',
    'M3 12h3',
    'M18 12h3',
    'M5.6 5.6l2.1 2.1',
    'M16.3 16.3l2.1 2.1',
    'M5.6 18.4l2.1-2.1',
    'M16.3 7.7l2.1-2.1',
  ],
  blob: ['M4 6.5h16l-2.2 13.5H6.2z', 'M4 6.5c0-1.4 3.6-2.5 8-2.5s8 1.1 8 2.5'],
  log: ['M4 3.5h12v17H4z', 'M7 7.5h6', 'M7 11h6', 'M7 14.5h6', 'M19.5 13v7.5', 'M17.5 18.5l2 2 2-2'],
  matcher: ['M2.5 8h8', 'M8 5.5l2.5 2.5L8 10.5', 'M21.5 16h-8', 'M16 13.5L13.5 16l2.5 2.5', 'M12 3.5v17'],
  sequencer: ['M3 8.5h4v6H3z', 'M10 8.5h4v6h-4z', 'M17 8.5h4v6h-4z', 'M3.5 19h17', 'M18.5 17l2 2-2 2'],
};

/** The words a screen reader hears for a role glyph, beside the node's name. */
export const ROLE_NAMES: Record<RoleGlyph, string> = {
  log: 'an append-only log',
  matcher: 'a matching engine',
  sequencer: 'a sequencer',
};

export const glyphId = (glyph: SysGlyph) => `g-sys-${glyph}`;
