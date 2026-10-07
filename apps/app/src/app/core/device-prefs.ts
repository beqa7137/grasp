import { Preferences } from '@capacitor/preferences';

/** Reads a device preference (REDESIGN.md 2.11): kept on this device only, never synced. */
export async function readDevicePref(key: string): Promise<string | null> {
  return (await Preferences.get({ key })).value;
}

/**
 * Stores a device preference, or removes it for null. A `mirror` key keeps a copy in localStorage too: on iOS and Android
 * Preferences keeps its values outside the web view, where code that runs before the app starts cannot read them.
 */
export async function writeDevicePref(key: string, value: string | null, mirror?: string): Promise<void> {
  if (mirror) mirrorDevicePref(mirror, value);
  await (value === null ? Preferences.remove({ key }) : Preferences.set({ key, value }));
}

export function mirrorDevicePref(mirror: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(mirror);
    else localStorage.setItem(mirror, value);
  } catch {
    // Blocked storage only costs the first paint, which then follows the device until the service's init() corrects it.
  }
}
