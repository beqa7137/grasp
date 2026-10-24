import {
  FEED_BASELINE,
  FEED_PAGES_PER_S,
  FEED_PAGE_SIZES,
  FEED_PLACES,
  FEED_POSTS_PER_AUTHOR,
  FEED_READS,
  FEED_RENAMES_PER_S,
  feedAt,
  type FeedModel,
  type FeedSettings,
} from '@grasp/engine';
import { HIT, PAD, WIDE_FROM, readLayout, tablesLayout, trackBoxes, trafficLayout, writeLayout } from './feed-layout';
import { compact, count, pageFocus, readView, tablesView } from './feed-page-view';
import { legendKeys, trafficFocus, trafficView } from './feed-traffic-view';
import { renameSlowdown } from './feed-replay';
import { writeFocus, writeView } from './feed-write-view';
import { TAG, overlaps, type Box } from './focus-layout';

const WIDTHS = [248, 252, 288, 300, 322, 344, 400, 519, 520, 596, 652, 700];
const hitBox = (x: number, y: number): Box => ({ x: x - HIT / 2, y: y - HIT / 2, width: HIT, height: HIT });
const MODELS: { schema: number; read: number }[] = [
  { schema: 0, read: 0 },
  { schema: 0, read: 1 },
  { schema: 0, read: 2 },
  { schema: 1, read: 0 },
];

function expectInside(boxes: readonly Box[], width: number, what: string) {
  for (const b of boxes) {
    expect(b.x, `${what}: ${JSON.stringify(b)} leaves the left edge`).toBeGreaterThanOrEqual(1);
    expect(b.x + b.width, `${what}: ${JSON.stringify(b)} leaves the right edge`).toBeLessThanOrEqual(width - 1);
  }
}

function expectApart(boxes: readonly Box[], what: string) {
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      expect(overlaps(boxes[i], boxes[j]), `${what}: ${JSON.stringify(boxes[i])} on ${JSON.stringify(boxes[j])}`).toBe(false);
}

const tagBox = (f: { tag: { x: number; y: number } }): Box => ({ ...f.tag, ...TAG });

/** Each outline takes in every text it touches, and its "Look here" tag covers none. */
function expectTagsClear(
  focus: readonly (Box & { id: string; tag: { x: number; y: number } })[],
  texts: readonly Box[],
  width: number,
  what: string,
) {
  for (const f of focus) {
    for (const t of texts)
      if (overlaps(f, t))
        expect(
          t.x >= f.x && t.y >= f.y && t.x + t.width <= f.x + f.width && t.y + t.height <= f.y + f.height,
          `${what}: ${f.id} cuts ${JSON.stringify(t)}`,
        ).toBe(true);
    const tag = tagBox(f);
    expect(tag.x, `${what} ${f.id}`).toBeGreaterThanOrEqual(1);
    expect(tag.x + tag.width, `${what} ${f.id}`).toBeLessThanOrEqual(width - 1);
    for (const t of texts) expect(overlaps(tag, t), `${what}: ${f.id} tag on ${JSON.stringify(t)}`).toBe(false);
  }
  for (const [i, a] of focus.entries())
    for (const b of focus.slice(i + 1)) expect(overlaps(a, b), `${what}: ${a.id} frame on ${b.id}`).toBe(false);
}

describe('feed layout', () => {
  it('keeps one height per width whatever the settings, and takes its wide form at 520px', () => {
    expect(readLayout(WIDE_FROM - 1).wide).toBe(false);
    expect(readLayout(WIDE_FROM).wide).toBe(true);
    for (const w of WIDTHS) {
      const page = readLayout(w).height + tablesLayout(w, readLayout(w).height).height;
      expect(page, `${w}`).toBeGreaterThan(0);
      expect(writeLayout(w).height).toBeGreaterThan(0);
      expect(trafficLayout(w).height).toBeGreaterThan(0);
    }
  });

  it.each(WIDTHS)(
    'draws every read, page size, place and ghost at %ipx with no text on another or off the stage',
    (w) => {
      const L = readLayout(w);
      const T = tablesLayout(w, L.height);
      for (const m of MODELS)
        for (const pageSize of FEED_PAGE_SIZES)
          for (const place of FEED_PLACES.keys())
            for (const ghost of [null, ...FEED_READS] as (FeedModel | null)[]) {
              const settings: FeedSettings = { ...FEED_BASELINE, ...m, pageSize, place };
              if (ghost && (m.schema === 1 || ghost === FEED_READS[m.read])) continue;
              for (const replayed of [null, 0, 3]) {
                const state = { settings, ghost, replayed, rename: null, reduced: false };
                const r = readView(L, state);
                const what = `${w}px ${JSON.stringify({ ...m, pageSize, place, ghost, replayed })}`;
                expectInside(r.texts, w, what);
                expectApart(r.texts, what);
                if (r.magnifier) {
                  const mag = { x: r.magnifier.x, y: r.magnifier.y, width: r.magnifier.width, height: r.magnifier.height };
                  for (const t of r.texts.slice(0, -1))
                    if (t.y > L.rowB + 4) expect(overlaps(mag, t), `${what}: magnifier on text`).toBe(false);
                  expect(r.magnifier.y, what).toBeGreaterThan(L.rowB + 2);
                }
                const page = tablesView(T, L.wide, state);
                const track = trackBoxes(
                  T.pageTrack,
                  FEED_PAGE_SIZES.map(String),
                  FEED_PAGE_SIZES.indexOf(pageSize as never),
                  String(pageSize),
                  'Posts a page',
                );
                expectInside([...page.texts, ...track], w, `${what} tables`);
                expectApart([...page.texts, ...track], `${what} tables`);
                const texts = [...r.texts, ...page.texts, ...track];
                expectTagsClear(pageFocus(L, T, texts), texts, w, what);
              }
            }
    },
    60_000,
  );

  it.each(WIDTHS.filter((w) => w >= 288))('writes N+1 and batched IN in full SQL from the same host to cross-zone at %ipx', (w) => {
    const L = readLayout(w);
    for (const read of [0, 1])
      for (const place of [0, 1, 2]) {
        const r = readView(L, { settings: { ...FEED_BASELINE, read, place }, ghost: null, replayed: null, rename: null, reduced: false });
        expect(r.sql[1].parts.map((p) => p.text).join(''), `${w}px read ${read} place ${place}`).toContain('WHERE id');
      }
  });

  it.each(WIDTHS)('fits the tables in every schema and rename state at %ipx', (w) => {
    const L = readLayout(w);
    const T = tablesLayout(w, L.height);
    for (const m of MODELS)
      for (const rename of [null, 0.5, 1])
        for (const reduced of [false, true]) {
          const v = tablesView(T, L.wide, { settings: { ...FEED_BASELINE, ...m }, ghost: null, replayed: null, rename, reduced });
          const what = `${w}px ${JSON.stringify({ ...m, rename, reduced })}`;
          expect(v.postColumns.length, what).toBeGreaterThanOrEqual(m.schema ? 3 : 2);
          expectInside(v.texts, w, what);
          expectApart(v.texts, what);
          for (const c of v.postColumns) expect(c.x + c.width - 8, what).toBeLessThanOrEqual(T.posts.x + T.posts.width - 8);
        }
  });

  it.each(WIDTHS)('keeps the page stage’s targets apart at %ipx: the play button, the four places and the posts-a-page handle', (w) => {
    const L = readLayout(w);
    const T = tablesLayout(w, L.height);
    const targets: [string, Box][] = [
      ['play', { x: PAD - 6, y: 4, width: HIT, height: HIT }],
      ...L.chips.map((c, i): [string, Box] => [`place ${i}`, c]),
      ...T.pageTrack.positions.map((x, i): [string, Box] => [`page ${i}`, hitBox(x, T.pageTrack.y)]),
    ];
    for (const [a, p] of targets)
      for (const [b, q] of targets)
        if (a < b && !(a.startsWith('page') && b.startsWith('page'))) expect(overlaps(p, q), `${a} on ${b}`).toBe(false);
    for (const c of L.chips) {
      expect(c.height).toBeGreaterThanOrEqual(HIT);
      expect(c.x + c.width).toBeLessThanOrEqual(w - PAD);
    }
    expect(T.pageTrack.positions[1] - T.pageTrack.positions[0]).toBeGreaterThanOrEqual(40);
  });

  it.each(WIDTHS)(
    'draws every rename at %ipx with no text on another, and keeps the playhead clear of Ada’s posts handle',
    (w) => {
      const W = writeLayout(w);
      for (const schema of [0, 1])
        for (const postsPerAuthor of FEED_POSTS_PER_AUTHOR)
          for (const renamesPerSecond of FEED_RENAMES_PER_S)
            for (const pagesPerSecond of FEED_PAGES_PER_S)
              for (const rename of [null, 0.45, 1])
                for (const [hideStale, showBehind] of [
                  [false, true],
                  [true, true],
                  [false, false],
                ]) {
                  const settings = { ...FEED_BASELINE, schema, postsPerAuthor, renamesPerSecond, pagesPerSecond };
                  const slowdown = renameSlowdown(feedAt(settings).rewriteMs || 1);
                  const v = writeView(W, { settings, rename, slowdown, hideStale, showBehind });
                  const i = FEED_POSTS_PER_AUTHOR.indexOf(postsPerAuthor as never);
                  const all = [
                    ...v.texts,
                    ...trackBoxes(W.postsTrack, FEED_POSTS_PER_AUTHOR.map(compact), i, count(postsPerAuthor), 'Ada’s posts'),
                  ];
                  const what = `${w}px ${JSON.stringify({ schema, postsPerAuthor, renamesPerSecond, pagesPerSecond, rename, hideStale, showBehind })}`;
                  expectInside(all, w, what);
                  expectApart(all, what);
                  expectTagsClear(writeFocus(W, all), all, w, what);
                }
      const posts = W.postsTrack.positions.map((x) => hitBox(x, W.postsTrack.y));
      const playhead = [W.bar.x0, W.bar.x1].map((x) => hitBox(x, W.bar.y + 6));
      for (const p of posts) for (const q of playhead) expect(overlaps(p, q)).toBe(false);
      for (const p of posts) expect(overlaps(p, { x: PAD - 6, y: 4, width: HIT, height: HIT })).toBe(false);
      expect(W.postsTrack.positions[1] - W.postsTrack.positions[0]).toBeGreaterThanOrEqual(40);
      expect(W.grid.x + W.grid.width).toBeLessThanOrEqual(w - PAD);
    },
    60_000,
  );

  it.each(WIDTHS)(
    'draws the traffic at every rate and schema at %ipx with no text on another, the handles and Table apart',
    (w) => {
      const T = trafficLayout(w);
      const table = { x: w - 4 - 64, y: 0, width: 64, height: HIT };
      for (const schema of [0, 1])
        for (const postsPerAuthor of FEED_POSTS_PER_AUTHOR)
          for (const pagesPerSecond of FEED_PAGES_PER_S)
            for (const renamesPerSecond of FEED_RENAMES_PER_S)
              for (const pageSize of [10, 100])
                for (const [hideDenormalized, showBehind] of [
                  [false, schema === 1],
                  [schema === 0, false],
                ]) {
                  const settings = { ...FEED_BASELINE, schema, postsPerAuthor, pagesPerSecond, renamesPerSecond, pageSize };
                  const v = trafficView(T, { settings, hideDenormalized, showBehind });
                  const tracks = [
                    ...trackBoxes(
                      T.pagesTrack,
                      FEED_PAGES_PER_S.map(compact),
                      FEED_PAGES_PER_S.indexOf(pagesPerSecond as never),
                      count(pagesPerSecond),
                      'Pages a second',
                    ),
                    ...trackBoxes(
                      T.renamesTrack,
                      FEED_RENAMES_PER_S.map(String),
                      FEED_RENAMES_PER_S.indexOf(renamesPerSecond as never),
                      String(renamesPerSecond),
                      'Renames a second',
                    ),
                  ];
                  const all = [...v.texts, ...tracks];
                  const what = `${w}px ${JSON.stringify({ schema, postsPerAuthor, pagesPerSecond, renamesPerSecond, pageSize, hideDenormalized })}`;
                  expectInside(all, w, what);
                  expectApart(all, what);
                  expectTagsClear(trafficFocus(T), all, w, what);
                  for (const t of all) expect(overlaps(t, table), `${what}: Table on ${JSON.stringify(t)}`).toBe(false);
                }
      const handles = [T.pagesTrack, T.renamesTrack].map((t) => t.positions.map((x) => hitBox(x, t.y)));
      for (const p of handles[0]) for (const q of handles[1]) expect(overlaps(p, q)).toBe(false);
      for (const h of handles.flat()) expect(overlaps(h, table)).toBe(false);
      expect(T.pagesTrack.positions[1] - T.pagesTrack.positions[0]).toBeGreaterThanOrEqual(40);
      expect(legendKeys(T, false).reads.y).toBeGreaterThan(T.plot.b + 34);
    },
    60_000,
  );
});
