import { Preferences } from '@capacitor/preferences';
import type { Story } from '@grasp/engine';
import { STORY_BANK_KEY, draftKeys, storyStashKey } from './local-drafts';

/** A bank kept aside is a learner's writing left on a device that may be shared, so it goes after this long. */
const STASH_KEPT_MS = 90 * 24 * 60 * 60 * 1000;

interface StoryStash {
  /** Missing on a stash kept before stashes were dated. */
  savedAt?: string;
  stories: Story[];
}

const parse = (value: string): StoryStash | null => {
  try {
    const stash = JSON.parse(value) as Story[] | StoryStash;
    return Array.isArray(stash) ? { stories: stash } : Array.isArray(stash?.stories) ? stash : null;
  } catch {
    return null;
  }
};
const expired = (stash: StoryStash | null, now: Date) =>
  !stash || (stash.savedAt !== undefined && now.getTime() - Date.parse(stash.savedAt) > STASH_KEPT_MS);
const serialize = (stories: readonly Story[], now: Date) => JSON.stringify({ savedAt: now.toISOString(), stories });

/** The bank kept aside for a learner; an expired one is dropped instead. */
export async function readStoryStash(learnerId: string, now: Date): Promise<Story[]> {
  const key = storyStashKey(learnerId);
  const { value } = await Preferences.get({ key });
  if (!value) return [];
  const stash = parse(value);
  if (stash && !expired(stash, now)) return stash.stories;
  await Preferences.remove({ key });
  return [];
}

export async function writeStoryStash(learnerId: string, stories: readonly Story[], now: Date): Promise<void> {
  await Preferences.set({ key: storyStashKey(learnerId), value: serialize(stories, now) });
}

/** Drops every expired stash, and dates an undated one now so that it expires in turn. */
export async function sweepStoryStashes(now: Date): Promise<void> {
  const keys = await draftKeys(`${STORY_BANK_KEY}.`);
  await Promise.all(
    keys.map(async (key) => {
      const { value } = await Preferences.get({ key });
      if (!value) return;
      const stash = parse(value);
      if (expired(stash, now)) await Preferences.remove({ key });
      else if (stash && !stash.savedAt) await Preferences.set({ key, value: serialize(stash.stories, now) });
    }),
  );
}
