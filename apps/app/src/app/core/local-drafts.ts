import { Preferences } from '@capacitor/preferences';

export const CODE_DRAFT_PREFIX = 'grasp.code.draft.';
export const STAR_DRAFT_PREFIX = 'grasp.behavioral.draft.';
export const CASE_DRAFT_PREFIX = 'grasp.case.';
export const MOCK_LOOP_PREFIX = 'grasp.interview.loop.';
export const STORY_BANK_KEY = 'grasp.behavioral.stories';
export const storyStashKey = (learnerId: string) => `${STORY_BANK_KEY}.${learnerId}`;

export async function draftKeys(prefix: string): Promise<string[]> {
  const { keys } = await Preferences.keys();
  return keys.filter((key) => key.startsWith(prefix));
}

/** Drafts are the learner's own writing, so erasing their data erases these too, though they never leave the device. */
export async function clearDrafts(): Promise<void> {
  const prefixes = [CODE_DRAFT_PREFIX, STAR_DRAFT_PREFIX, CASE_DRAFT_PREFIX, MOCK_LOOP_PREFIX];
  const keys = (await Promise.all(prefixes.map(draftKeys))).flat();
  await Promise.all([...keys, STORY_BANK_KEY].map((key) => Preferences.remove({ key })));
}
