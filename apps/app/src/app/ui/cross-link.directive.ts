import { Directive, ElementRef, inject } from '@angular/core';
import { Router, RouterLink, type UrlTree } from '@angular/router';

/** The tab a URL belongs to: its first segment (REDESIGN.md 2.4), which is also Ionic's stack id. */
export function tabOf(url: string): string {
  return url.split(/[?#]/)[0].split('/').find(Boolean) ?? '';
}

/** Navigation state for a link to `target`: where it came from, when that is another tab (`app-back` returns there). */
export function crossState(router: Router, target: UrlTree | string): { from: string } | undefined {
  const url = typeof target === 'string' ? target : router.serializeUrl(target);
  return tabOf(url) === tabOf(router.url) ? undefined : { from: router.url };
}

/**
 * Marks a link that may lead into another tab: it then carries where it came from, so `app-back` can return there instead
 * of popping the other tab's stack (REDESIGN.md 2.5).
 */
@Directive({ selector: 'a[routerLink][crossLink]' })
export class CrossLinkDirective {
  constructor() {
    const link = inject(RouterLink);
    const router = inject(Router);
    // Capture runs before RouterLink's own click listener, which reads the state as it navigates.
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.addEventListener(
      'click',
      () => {
        const target = link.urlTree;
        link.state = target ? crossState(router, target) : undefined;
      },
      { capture: true },
    );
  }
}
