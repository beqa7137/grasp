export type MotionPreference = 'system' | 'reduced' | 'full';

export const MOTION_KEY = 'grasp.motion';
/** Where main.ts looks before the app starts; on the web it is where Preferences keeps MOTION_KEY. */
export const MOTION_MIRROR_KEY = `CapacitorStorage.${MOTION_KEY}`;

export const motionPreference = (value: string | null | undefined): MotionPreference =>
  value === 'reduced' || value === 'full' ? value : 'system';

/**
 * Applies the Motion preference to `<html>` as `data-motion` before the app starts, and says whether Ionic may animate page
 * transitions, which it reads only at bootstrap. `data-motion="off"` is the tools' test mode (from an init script, or
 * `?motion=off`, which is stripped so routes never see it) and wins over everything; System leaves no attribute and
 * follows the device.
 */
export function bootMotion(win: Window = window): { animated: boolean } {
  const root = win.document.documentElement;
  const url = new URL(win.location.href);
  if (url.searchParams.get('motion') === 'off') {
    root.setAttribute('data-motion', 'off');
    url.searchParams.delete('motion');
    win.history.replaceState(win.history.state, '', url.href);
  }
  if (root.getAttribute('data-motion') !== 'off') {
    let saved: string | null = null;
    try {
      saved = win.localStorage.getItem(MOTION_MIRROR_KEY);
    } catch {
      // Blocked storage follows the device.
    }
    applyMotion(root, motionPreference(saved));
  }
  const mode = root.getAttribute('data-motion');
  const deviceReduces = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  return { animated: mode === 'full' || (mode !== 'off' && mode !== 'reduced' && !deviceReduces) };
}

/** Sets `data-motion` for a preference, leaving the test mode's `off` in place. */
export function applyMotion(root: HTMLElement, preference: MotionPreference): void {
  if (root.getAttribute('data-motion') === 'off') return;
  if (preference === 'system') root.removeAttribute('data-motion');
  else root.setAttribute('data-motion', preference);
}
