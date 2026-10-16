import { describe, expect, it } from 'vitest';
import { COMPETENCY_CATALOG } from './catalog.js';
import type { StarDraft } from './star-check.js';
import { deletedStory, isNewer, mergeStories, nextChange, reviewBank, storyCovers, storyTitle, type Story } from './stories.js';

const words = (n: number) => Array.from({ length: n }, () => 'detail').join(' ');
const told: StarDraft = {
  situation: 'Our checkout service timed out for one in fifty orders during the spring sale last year.',
  task: 'I owned the payment client and had two days to stop the timeouts before the next sale.',
  action: `I traced the slow calls to a retry loop, I capped the retries, I added a circuit breaker and I load tested it. ${words(160)}`,
  result: 'Timeouts fell from 2% to 0.1% and the next sale took 40% more orders without an incident.',
  reflection: 'I learned to load test the client, not only the server, before every sale since then.',
};
const story = (id: string, competencyIds: string[], draft = told, title = id, updatedAt = '2026-09-01T00:00:00.000Z'): Story => ({
  id,
  title,
  competencyIds,
  draft,
  updatedAt,
});
const at = (id: string, title: string, updatedAt: string) => story(id, ['ownership'], told, title, updatedAt);

describe('reviewBank', () => {
  it('lists every competency with the stories that answer it, and the ones none do', () => {
    const review = reviewBank([story('a', ['ownership', 'delivery']), story('b', ['ownership'])]);
    expect(review.coverage).toHaveLength(COMPETENCY_CATALOG.length);
    expect(review.coverage.find((c) => c.competencyId === 'ownership')?.storyIds).toEqual(['a', 'b']);
    expect(review.covered).toBe(2);
    expect(review.gaps).toHaveLength(COMPETENCY_CATALOG.length - 2);
    expect(review.gaps).toContain('Ambiguity');
  });

  it("covers only a story's first three tags, the rule competency states use, and never a deleted story", () => {
    const four = story('a', ['ownership', 'delivery', 'ambiguity', 'conflict']);
    expect(storyCovers(four, 'ambiguity')).toBe(true);
    expect(storyCovers(four, 'conflict')).toBe(false);
    expect(storyCovers({ ...four, deleted: true }, 'ownership')).toBe(false);
    const review = reviewBank([four]);
    expect(review.covered).toBe(3);
    expect(review.coverage.find((c) => c.competencyId === 'conflict')?.storyIds).toEqual([]);
  });

  it('asks for more stories below eight, and nothing more once the bank is full and finished', () => {
    expect(reviewBank([story('a', ['ownership'])]).advice[0]).toContain('You have 1');
    const full = Array.from({ length: 8 }, (_, i) => story(`s${i}`, ['ownership']));
    expect(reviewBank(full).advice).toEqual([]);
  });

  it('names an untagged story, one stretched over too many competencies, and one that fails checks', () => {
    const advice = reviewBank([
      story('a', []),
      story('b', ['ownership', 'delivery', 'conflict', 'failure']),
      story('c', ['ownership'], { ...told, result: '' }),
    ]).advice.join('\n');
    expect(advice).toContain('Tag "a"');
    expect(advice).toContain('"b" is tagged with 4');
    expect(advice).toMatch(/"c" has \d+ checks? to fix/);
  });

  it('names a story without a title', () => {
    expect(storyTitle(story('a', [], told, '  '))).toBe('Untitled story');
  });
});

describe('mergeStories', () => {
  it('keeps the later change of each story and every story only one side has', () => {
    const local = [
      at('a', 'local a', '2026-09-02T10:00:00.000Z'),
      at('b', 'local b', '2026-09-01T10:00:00.000Z'),
      at('c', 'only local', '2026-09-01T00:00:00.000Z'),
    ];
    const remote = [
      at('a', 'remote a', '2026-09-02T09:59:59.999Z'),
      at('b', 'remote b', '2026-09-01T10:00:00.001Z'),
      at('d', 'only remote', '2026-09-01T00:00:00.000Z'),
    ];
    expect(mergeStories(local, remote).map((s) => s.title)).toEqual(['local a', 'remote b', 'only local', 'only remote']);
  });

  it('prefers the remote copy on a tie, and compares instants rather than text', () => {
    expect(mergeStories([at('a', 'local', '2026-09-02T12:00:00.000Z')], [at('a', 'remote', '2026-09-02T12:00:00.000Z')])[0]?.title).toBe(
      'remote',
    );
    expect(
      mergeStories([at('a', 'local', '2026-09-02T12:00:00.000Z')], [at('a', 'remote', '2026-09-02T13:00:00.000+02:00')])[0]?.title,
    ).toBe('local');
  });

  it('lets a later delete win over an edit, and a later edit win over a delete', () => {
    const edited = at('a', 'edited', '2026-09-02T10:00:00.000Z');
    expect(mergeStories([edited], [deletedStory('a', '2026-09-02T11:00:00.000Z')])[0]).toMatchObject({ deleted: true, title: '' });
    expect(mergeStories([deletedStory('a', '2026-09-02T09:00:00.000Z')], [edited])[0]).toBe(edited);
  });

  it('treats a story saved before sync, with no updatedAt, as older than any synced copy', () => {
    const legacy = { ...at('a', 'legacy', ''), updatedAt: undefined } as unknown as Story;
    expect(mergeStories([legacy], [at('a', 'synced', '1970-01-01T00:00:00.001Z')])[0]?.title).toBe('synced');
    expect(mergeStories([legacy], [])).toEqual([legacy]);
    expect(isNewer(legacy, undefined)).toBe(true);
    expect(isNewer(legacy, at('a', 'synced', '1970-01-01T00:00:00.001Z'))).toBe(false);
  });

  it('counts a story as newer only when it changed after the other copy', () => {
    const copy = at('a', 'x', '2026-09-02T10:00:00.000Z');
    expect(isNewer(at('a', 'y', '2026-09-02T10:00:00.001Z'), copy)).toBe(true);
    expect(isNewer(at('a', 'y', '2026-09-02T10:00:00.000Z'), copy)).toBe(false);
  });
});

describe('nextChange', () => {
  it('stamps the time now, or just after the last change when the clock runs behind it', () => {
    const now = new Date('2026-09-02T10:00:00.000Z');
    expect(nextChange(undefined, now)).toBe(now.toISOString());
    expect(nextChange(at('a', 'x', '2026-09-01T00:00:00.000Z'), now)).toBe(now.toISOString());
    expect(nextChange(at('a', 'x', '2026-09-02T12:00:00.000Z'), now)).toBe('2026-09-02T12:00:00.001Z');
    expect(nextChange(at('a', 'x', '2026-09-02T10:00:00.000Z'), now)).toBe('2026-09-02T10:00:00.001Z');
  });
});
