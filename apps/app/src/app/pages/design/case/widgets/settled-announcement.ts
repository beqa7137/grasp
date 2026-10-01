import { DestroyRef, effect, inject, signal, type Signal } from '@angular/core';

/** How long input must rest before the summary is announced, so dragging a slider does not queue an announcement per step. */
const SETTLE_MS = 600;

/**
 * The text for a widget's status region: `summary` once input has rested, never on mount, so the region stays empty
 * until the learner changes something. Call in an injection context.
 */
export function settledAnnouncement(summary: () => string): Signal<string> {
  const announcement = signal('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let mounted = false;
  inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  effect(() => {
    const text = summary();
    clearTimeout(timer);
    if (mounted) timer = setTimeout(() => announcement.set(text), SETTLE_MS);
    mounted = true;
  });
  return announcement;
}
