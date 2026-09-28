import { Preferences } from '@capacitor/preferences';

export const CODE_DRAFT_PREFIX = 'grasp.code.draft.';
export const STAR_DRAFT_PREFIX = 'grasp.behavioral.draft.';

export async function draftKeys(prefix: string): Promise<string[]> {
  const { keys } = await Preferences.keys();
  return keys.filter((key) => key.startsWith(prefix));
}

/** Drafts are the learner's own writing, so erasing their data erases these too, though they never leave the device. */
export async function clearDrafts(): Promise<void> {
  const keys = [...(await draftKeys(CODE_DRAFT_PREFIX)), ...(await draftKeys(STAR_DRAFT_PREFIX))];
  await Promise.all(keys.map((key) => Preferences.remove({ key })));
}
