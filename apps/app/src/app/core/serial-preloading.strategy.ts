import { DestroyRef, Injectable, InjectionToken, inject } from '@angular/core';
import type { PreloadingStrategy, Route } from '@angular/router';
import { from, lastValueFrom, of, type Observable } from 'rxjs';

/**
 * Resolves once the first screen is idle (REDESIGN.md 2.5), so its own chunks never queue behind the preloads on a slow
 * phone. Today has no deferred blocks yet, so that is the first idle period, or 5 seconds at most.
 */
export const FIRST_IDLE = new InjectionToken<Promise<void>>('first idle', {
  factory: () =>
    new Promise<void>((resolve) => {
      if ('requestIdleCallback' in window) requestIdleCallback(() => resolve(), { timeout: 5000 });
      else setTimeout(resolve);
    }),
});

/** Routes without a `preload` rank load after the ranked ones. */
const UNRANKED = 2;

/**
 * Preloads one route at a time, by rank (`data.preload`: the hubs, then the main detail pages), then in declaration
 * order. The route order itself serves matching (2.5), so it cannot also put the hubs first.
 */
@Injectable({ providedIn: 'root' })
export class SerialPreloadingStrategy implements PreloadingStrategy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly firstIdle = inject(FIRST_IDLE);
  private readonly queue: { rank: number; run: () => Promise<void> }[] = [];
  private draining = false;

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    // A lazy-child loader can wait for nested preloads queued behind itself.
    if (!route.loadComponent || route.loadChildren) return of(null);

    const rank: number = route.data?.['preload'] ?? UNRANKED;
    return from(
      new Promise<unknown>((resolve) => {
        const run = async () => {
          if (this.destroyRef.destroyed) return resolve(null);
          // Angular can emit a placeholder before the component finishes loading.
          resolve(
            await Promise.resolve()
              .then(() => lastValueFrom(load(), { defaultValue: null }))
              .catch(() => null),
          );
        };
        const at = this.queue.findIndex((queued) => queued.rank > rank);
        this.queue.splice(at < 0 ? this.queue.length : at, 0, { rank, run });
        void this.drain();
      }),
    );
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    await this.firstIdle;
    for (let next = this.queue.shift(); next; next = this.queue.shift()) await next.run();
    this.draining = false;
  }
}
