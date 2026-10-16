/** The part of a view in Ionic's private stack controller this reads; `destroy` and `unlistenEvents` are its `destroyView`. */
export interface IonicView {
  stackId?: string;
  url: string;
  ref: { destroy(): void };
  unlistenEvents(): void;
}

/** Ionic's stack controller: every tab's views in one list, in the order they were inserted. */
export interface IonicStack {
  views: IonicView[];
  activeView?: IonicView;
}

/** The outlet's stack controller, or null when an Ionic release no longer has it in this shape. */
export function ionicStack(outlet: unknown): IonicStack | null {
  const stack = (outlet as { stackCtrl?: Partial<IonicStack> } | null | undefined)?.stackCtrl;
  return Array.isArray(stack?.views) ? (stack as IonicStack) : null;
}

export interface UtilityPlan<V> {
  /** The Today stack's views under its lowest utility page, which stay under the opened one. */
  kept: V[];
  /** Its lowest utility page and every view above it. */
  dropped: V[];
  /** The shown view is dropped, so the opened page takes its place in the browser's history too. */
  replace: boolean;
}

/**
 * Where a rail utility goes on the Today stack (REDESIGN.md 2.6): on the views under the lowest utility page already there,
 * so the stack never holds two, even when the first led on to another page (Study plan to Review).
 */
export function planUtility<V extends { stackId?: string; url: string }>(
  views: readonly V[],
  active: V | undefined,
  isUtility: (url: string) => boolean,
): UtilityPlan<V> {
  const today = views.filter((v) => v.stackId === 'today');
  const lowest = today.findIndex((v) => isUtility(v.url));
  const kept = lowest < 0 ? today : today.slice(0, lowest);
  const dropped = lowest < 0 ? [] : today.slice(lowest);
  return { kept, dropped, replace: !!active && dropped.includes(active) };
}

/**
 * Opens a utility page in one navigation. The Today stack leaves Ionic's list while it runs, so a tab switch neither shows
 * nor resets it, and returns under the new page after; the dropped views are destroyed here, except a shown one, which
 * stays last for `replaceUrl` to remove (Ionic drops the last view it holds, whichever tab it belongs to).
 */
export async function openOnTodayStack(
  stack: IonicStack | null,
  isUtility: (url: string) => boolean,
  navigate: (replace: boolean) => Promise<boolean>,
): Promise<void> {
  if (!stack) {
    await navigate(false);
    return;
  }
  const active = stack.activeView;
  const { kept, dropped, replace } = planUtility(stack.views, active, isUtility);
  if (!dropped.length && active?.stackId === 'today') {
    await navigate(false);
    return;
  }
  const before = stack.views;
  stack.views = [...before.filter((v) => v.stackId !== 'today'), ...(replace && active ? [active] : [])];
  let navigated = false;
  try {
    navigated = await navigate(replace);
  } finally {
    if (!navigated) stack.views = before;
  }
  if (!navigated) return;
  const at = stack.activeView ? stack.views.indexOf(stack.activeView) : -1;
  stack.views.splice(at < 0 ? stack.views.length : at, 0, ...kept);
  for (const view of dropped)
    if (view !== active) {
      view.ref.destroy();
      view.unlistenEvents();
    }
}
