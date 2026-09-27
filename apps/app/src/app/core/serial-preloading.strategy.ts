import { DestroyRef, Injectable, inject } from '@angular/core';
import type { PreloadingStrategy, Route } from '@angular/router';
import { from, lastValueFrom, of, type Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SerialPreloadingStrategy implements PreloadingStrategy {
  private readonly destroyRef = inject(DestroyRef);
  private pending: Promise<unknown> = Promise.resolve();

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    // A lazy-child loader can wait for nested preloads queued behind itself.
    if (!route.loadComponent || route.loadChildren) return of(null);

    this.pending = this.pending
      .then(() => {
        if (this.destroyRef.destroyed) return null;
        // Angular can emit a placeholder before the component finishes loading.
        return lastValueFrom(load(), { defaultValue: null });
      })
      .catch(() => null);
    return from(this.pending);
  }
}
