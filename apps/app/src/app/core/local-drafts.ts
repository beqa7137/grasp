import { Preferences } from '@capacitor/preferences';

export const CODE_DRAFT_PREFIX = 'grasp.code.draft.';
export const STAR_DRAFT_PREFIX = 'grasp.behavioral.draft.';
export const STORY_BANK_KEY = 'grasp.behavioral.stories';
export const storyStashKey = (learnerId: string) => `${STORY_BANK_KEY}.${learnerId}`;

export async function draftKeys(prefix: string): Promise<string[]> {
  const { keys } = await Preferences.keys();
  return keys.filter((key) => key.startsWith(prefix));
}

/** Drafts are the learner's own writing, so erasing their data erases these too, though they never leave the device. */
export async function clearDrafts(): Promise<void> {
  const keys = [...(await draftKeys(CODE_DRAFT_PREFIX)), ...(await draftKeys(STAR_DRAFT_PREFIX))];
  await Promise.all([...keys, STORY_BANK_KEY].map((key) => Preferences.remove({ key })));
}
