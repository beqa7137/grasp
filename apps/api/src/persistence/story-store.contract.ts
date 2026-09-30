import { deletedStory, EMPTY_STAR_DRAFT, STORY_LIMITS, type Story } from '@grasp/engine';
import { describe, expect, it } from 'vitest';
import { MAX_TOMBSTONES, type StoryStore } from './story.store.js';

export interface StoryStoreFixture {
  store: StoryStore;
  /** A learner the store may write for, as an account's learner always exists. */
  learner(): Promise<string>;
  erase(learnerId: string): Promise<void>;
}

const at = (minute: number) => new Date(Date.UTC(2026, 8, 1, 12, minute)).toISOString();
const story = (id: string, minute: number, title = id): Story => ({
  id,
  title,
  competencyIds: ['ownership', 'delivery'],
  draft: { ...EMPTY_STAR_DRAFT, situation: `The ${title} situation.`, action: 'I rewrote the retry loop.' },
  updatedAt: at(minute),
});

/** Behaviour every StoryStore must have; run against each implementation. */
export function storyStoreContract(name: string, make: () => StoryStoreFixture) {
  describe(`${name} story store`, () => {
    it('stores a story with its rehearsal and lists each learner their own, oldest change first', async () => {
      const { store, learner } = make();
      const [ada, bob] = [await learner(), await learner()];
      const told = { ...story('b', 1), rehearsal: { step: 1, told: 2, due: at(59) } };
      expect(await store.put(ada, story('a', 2))).toEqual(story('a', 2));
      await store.put(ada, told);
      await store.put(bob, story('c', 3));
      expect(await store.list(ada)).toEqual([told, story('a', 2)]);
      expect(await store.list(bob)).toEqual([story('c', 3)]);
    });

    it('keeps the later change and returns the copy that holds, so a stale or repeated write changes nothing', async () => {
      const { store, learner } = make();
      const ada = await learner();
      await store.put(ada, story('a', 5, 'second'));
      expect(await store.put(ada, story('a', 4, 'first'))).toEqual(story('a', 5, 'second'));
      expect(await store.put(ada, story('a', 5, 'same time'))).toEqual(story('a', 5, 'second'));
      expect(await store.put(ada, story('a', 6, 'third'))).toEqual(story('a', 6, 'third'));
      expect(await store.list(ada)).toEqual([story('a', 6, 'third')]);
    });

    it('decides on the device time, then dates the change no later than the server clock and after the copy it replaces', async () => {
      const { store, learner } = make();
      const ada = await learner();
      await store.put(ada, story('a', 10, 'stored'));
      const behind = new Date(Date.UTC(2026, 8, 1, 12, 5));
      expect(await store.put(ada, story('a', 20, 'newer'), behind)).toEqual({
        ...story('a', 20, 'newer'),
        updatedAt: '2026-09-01T12:10:00.001Z',
      });
      expect(await store.put(ada, story('b', 30, 'ahead'), behind)).toEqual({
        ...story('b', 30, 'ahead'),
        updatedAt: behind.toISOString(),
      });
      expect((await store.list(ada)).map((s) => s.title)).toEqual(['ahead', 'newer']);
    });

    it('keeps a delete as a tombstone, and lets a later edit bring the story back', async () => {
      const { store, learner } = make();
      const ada = await learner();
      await store.put(ada, story('a', 1));
      expect(await store.put(ada, deletedStory('a', at(2)))).toEqual(deletedStory('a', at(2)));
      expect(await store.put(ada, story('a', 1, 'stale copy'))).toEqual(deletedStory('a', at(2)));
      expect(await store.list(ada)).toEqual([deletedStory('a', at(2))]);
      await store.put(ada, story('a', 3, 'edited after'));
      expect(await store.list(ada)).toEqual([story('a', 3, 'edited after')]);
    });

    it('does not keep a tombstone for a story it never had', async () => {
      const { store, learner } = make();
      const ada = await learner();
      expect(await store.put(ada, deletedStory('never', at(1)))).toEqual(deletedStory('never', at(1)));
      expect(await store.list(ada)).toEqual([]);
    });

    it(`keeps at most ${STORY_LIMITS.stories} stories, even when new ones race, and still accepts edits and deletes`, async () => {
      const { store, learner } = make();
      const ada = await learner();
      for (let i = 0; i < STORY_LIMITS.stories - 1; i++) await store.put(ada, story(`s${i}`, 1));
      const racing = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => store.put(ada, story(`new${i}`, 2))));
      expect(racing.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(racing.find((r) => r.status === 'rejected')).toMatchObject({ reason: { status: 409, response: { code: 'story_limit' } } });
      await expect(store.put(ada, story('one-more', 3))).rejects.toMatchObject({ status: 409 });
      await store.put(ada, story('s0', 4, 'edited'));
      await store.put(ada, deletedStory('s1', at(5)));
      await store.put(ada, story('one-more', 6));
      expect((await store.list(ada)).filter((s) => !s.deleted)).toHaveLength(STORY_LIMITS.stories);
    });

    it(`drops the oldest tombstones beyond ${MAX_TOMBSTONES}`, async () => {
      const { store, learner } = make();
      const ada = await learner();
      for (let i = 0; i <= MAX_TOMBSTONES; i++) {
        await store.put(ada, story(`s${i}`, 1));
        await store.put(ada, deletedStory(`s${i}`, new Date(Date.UTC(2026, 8, 2, 0, 0, i)).toISOString()));
      }
      const left = await store.list(ada);
      expect(left).toHaveLength(MAX_TOMBSTONES);
      expect(left.map((s) => s.id)).not.toContain('s0');
      expect(left.at(-1)?.id).toBe(`s${MAX_TOMBSTONES}`);
    });

    it('refuses a write that arrives after the learner was erased, and erasure leaves no story behind', async () => {
      const { store, learner, erase } = make();
      const ada = await learner();
      await store.put(ada, story('a', 1));
      await erase(ada);
      expect(await store.list(ada)).toEqual([]);
      await expect(store.put(ada, story('a', 2))).rejects.toMatchObject({ status: 410, response: { code: 'learner_erased' } });
      expect(await store.list(ada)).toEqual([]);
    });
  });
}
