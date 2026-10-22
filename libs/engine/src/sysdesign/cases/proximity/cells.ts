import { mulberry32 } from '../../../algorithms/random.js';
import { num, spacedChoices, type WidgetCheckpoint } from '../widget-checkpoint.js';
import { KM_A_DEGREE, geohashBounds, geohashCellKm, geohashEncode, geohashNeighbours, haversineKm } from './geohash.js';

/**
 * A seeded town around one user. The user stands 42 m west of a longitude where geohash cells split at precision 3, so
 * at every finer precision the user's cell ends just east of them; the nearest place stands 25 m across that line.
 */
export const CELL_SEARCH = {
  places: 3_000,
  /** Every place lies within this many km of the user, north, south, east and west. */
  boxKm: 10,
  user: { lat: 40.75, lon: -73.1255 },
  across: { lat: 40.75, lon: -73.1247 },
  /** Most places cluster around a downtown this far east and north of the user, normally spread; the rest are even. */
  downtownKm: { east: 1.5, north: 1 },
  spreadKm: 2.5,
  clustered: 0.7,
  seed: 91,
} as const;

export const CELL_PRECISIONS = [5, 6, 7] as const;
export const RADIUS_LIMITS = { min: 0.1, max: 5, step: 0.1 } as const;

export interface Place {
  lat: number;
  lon: number;
  /** Distance from the user. */
  km: number;
}

/** Read the user's cell only, or the cell and its 8 neighbors. */
export type CellScope = 'own' | 'neighbors';

export interface CellSearchSettings {
  precision: number;
  radiusKm: number;
  scope: CellScope;
}

/** Within the radius and read, within it but never read, read and then dropped by the distance check, or neither. */
export type PlaceMark = 'found' | 'missed' | 'extra' | 'unread';

export interface CellSearchRun {
  cell: string;
  /** Every cell the search reads, the user's first. */
  cells: string[];
  widthKm: number;
  heightKm: number;
  marks: PlaceMark[];
  read: number;
  within: number;
  found: number;
  missed: number;
  extra: number;
  /** How far the cells read reach from the user on their nearest side: any radius up to this is fully covered. */
  coveredKm: number;
}

const { user } = CELL_SEARCH;
const lonKm = KM_A_DEGREE * Math.cos((user.lat * Math.PI) / 180);
const at = (eastKm: number, northKm: number) => ({ lat: user.lat + northKm / KM_A_DEGREE, lon: user.lon + eastKm / lonKm });

/** How far the user stands from the line east of them where cells split at precision 3 and at every finer one. */
export const EDGE_KM = haversineKm(user.lat, user.lon, user.lat, geohashBounds(geohashEncode(user.lat, user.lon, 3)).east);

/** Where a point lies from the user, in km east and north, on a flat map of the town (for drawing it). */
export const offsetKm = (lat: number, lon: number): [east: number, north: number] => [
  (lon - user.lon) * lonKm,
  (lat - user.lat) * KM_A_DEGREE,
];

let town: readonly Place[] | null = null;

/** The nearest place across the edge first, then the seeded rest. */
export function cellPlaces(): readonly Place[] {
  if (town) return town;
  const { places, boxKm, downtownKm, spreadKm, clustered, seed, across } = CELL_SEARCH;
  const rand = mulberry32(seed);
  const inBox = (v: number) => Math.abs(v) <= boxKm;
  const spot = (): [number, number] => {
    if (rand() >= clustered) return [(rand() * 2 - 1) * boxKm, (rand() * 2 - 1) * boxKm];
    for (;;) {
      const r = spreadKm * Math.sqrt(-2 * Math.log(1 - rand()));
      const t = 2 * Math.PI * rand();
      const p: [number, number] = [downtownKm.east + r * Math.cos(t), downtownKm.north + r * Math.sin(t)];
      if (inBox(p[0]) && inBox(p[1])) return p;
    }
  };
  const all = [across, ...Array.from({ length: places - 1 }, () => at(...spot()))];
  town = all.map((p) => ({ ...p, km: haversineKm(user.lat, user.lon, p.lat, p.lon) }));
  return town;
}

const hashed = new Map<number, string[]>();
const placeHashes = (precision: number) =>
  hashed.get(precision) ??
  hashed
    .set(
      precision,
      cellPlaces().map((p) => geohashEncode(p.lat, p.lon, precision)),
    )
    .get(precision)!;

function coveredKm(cells: string[]): number {
  const bounds = cells.map(geohashBounds);
  const south = Math.min(...bounds.map((b) => b.south));
  const north = Math.max(...bounds.map((b) => b.north));
  const west = Math.min(...bounds.map((b) => b.west));
  const east = Math.max(...bounds.map((b) => b.east));
  return Math.min(
    haversineKm(user.lat, user.lon, south, user.lon),
    haversineKm(user.lat, user.lon, north, user.lon),
    haversineKm(user.lat, user.lon, user.lat, west),
    haversineKm(user.lat, user.lon, user.lat, east),
  );
}

/** Reads the cells, keeps the places whose geohash starts with one of them, then checks each one's true distance. */
export function cellSearch(s: CellSearchSettings): CellSearchRun {
  if (!(s.radiusKm > 0 && s.precision >= 1 && s.precision <= 12)) throw new Error('Settings must be positive');
  const cell = geohashEncode(user.lat, user.lon, s.precision);
  const cells = s.scope === 'own' ? [cell] : [cell, ...geohashNeighbours(cell)];
  const searched = new Set(cells);
  const hashes = placeHashes(s.precision);
  const marks = cellPlaces().map((p, i): PlaceMark => {
    const read = searched.has(hashes[i]);
    const near = p.km <= s.radiusKm;
    return read ? (near ? 'found' : 'extra') : near ? 'missed' : 'unread';
  });
  const count = (m: PlaceMark) => marks.filter((v) => v === m).length;
  const found = count('found');
  const missed = count('missed');
  const extra = count('extra');
  return {
    cell,
    cells,
    ...geohashCellKm(s.precision, user.lat),
    marks,
    read: found + extra,
    within: found + missed,
    found,
    missed,
    extra,
    coveredKm: coveredKm(cells),
  };
}

export const placesText = (v: number) => `${num(v)} place${v === 1 ? '' : 's'}`;
export const kmText = (v: number) => (v < 1 ? `${num(v * 1000)} m` : `${Number(v.toFixed(v < 10 ? 2 : 1))} km`);
/** A radius as the slider sets it, in tenths of a km. */
export const radiusText = (v: number) => `${Number(v.toFixed(1))} km`;

/** How many characters two geohashes share from the start. */
export const sharedPrefix = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return i;
};

type CellQuestion = 'found' | 'read' | 'missed';

/** Asked from the settings, never from the outcome: own cell asks what it finds, a radius wider than a cell what 9 cells miss. */
function questionFor(s: CellSearchSettings, run: CellSearchRun): CellQuestion {
  if (s.scope === 'own') return 'found';
  return s.radiusKm > Math.min(run.widthKm, run.heightKm) ? 'missed' : 'read';
}

/**
 * A prediction about the current settings, read from the run: how many of the places within the radius the user's cell
 * alone finds, how many places 9 cells read, or how many places within the radius 9 cells too small for it miss.
 */
export function cellSearchCheckpoint(s: CellSearchSettings, run = cellSearch(s)): WidgetCheckpoint {
  const other = (change: Partial<CellSearchSettings>) => cellSearch({ ...s, ...change });
  const coarser = other({ precision: s.precision - 1 });
  const finer = other({ precision: s.precision + 1 });
  const flipped = other({ scope: s.scope === 'own' ? 'neighbors' : 'own' });
  const size = `${kmText(run.widthKm)} wide and ${kmText(run.heightKm)} tall`;
  const situation = `${placesText(run.within)} lie within ${radiusText(s.radiusKm)} of the user, and geohash cells at precision ${s.precision} are ${size} here`;
  const question = questionFor(s, run);
  if (question === 'found') {
    const across = geohashEncode(CELL_SEARCH.across.lat, CELL_SEARCH.across.lon, s.precision);
    return {
      prompt: `Predict: ${situation}. The search reads only the user's own cell, ${run.cell}. How many of the ${placesText(run.within)} does it find?`,
      ...spacedChoices(run.found, [run.within, run.read, flipped.found, coarser.found, 0], placesText, 1),
      explain: `Only places whose geohash starts with ${run.cell} are read: ${num(run.found)} of the ${num(run.within)} within the radius. The user stands ${kmText(EDGE_KM)} from the cell's east edge, and the other ${num(run.missed)} lie across an edge, among them a place only ${kmText(cellPlaces()[0].km)} away in ${across}, which shares just ${sharedPrefix(run.cell, across)} characters with the user's cell. Read the 8 neighbors too.`,
    };
  }
  if (question === 'read') {
    return {
      prompt: `Predict: ${situation}. The search reads the user's cell and its 8 neighbors. How many places does it read before checking distances?`,
      ...spacedChoices(run.read, [run.within, coarser.read, finer.read, flipped.read], placesText, 1),
      explain: `Nine cells, each ${size}, hold ${num(run.read)} places. ${num(run.found)} of them are within ${radiusText(s.radiusKm)}; the other ${num(run.extra)} are read and then dropped by the distance check. The radius is no longer than a side of a cell, so from anywhere in the middle cell the 9 cells cover the whole circle and nothing is missed.`,
    };
  }
  const why =
    run.missed > 0
      ? `The 9 cells reach only ${kmText(run.coveredKm)} from the user on the nearest side, less than the ${radiusText(s.radiusKm)} radius, so ${num(run.missed)} places within it lie in cells never read.`
      : `The 9 cells happen to reach ${kmText(run.coveredKm)} from the user on the nearest side, so nothing within ${radiusText(s.radiusKm)} lies outside them; a user nearer the block's edge would miss places.`;
  return {
    prompt: `Predict: ${situation}. The search reads the user's cell and its 8 neighbors. How many of the ${placesText(run.within)} does it miss?`,
    ...spacedChoices(run.missed, [0, run.within, coarser.missed, finer.missed, flipped.missed], placesText, 1),
    explain: `${why} A radius wider than a cell needs a coarser precision, whose cells are at least the radius, or more rings of cells.`,
  };
}
