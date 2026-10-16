import { Directive, ElementRef, Injectable, effect, inject, untracked } from '@angular/core';
import {
  type ActivatedRouteSnapshot,
  type Navigation,
  NavigationEnd,
  NavigationStart,
  Router,
  RouterLink,
  type UrlTree,
} from '@angular/router';
import { NavController } from '@ionic/angular';

/** A URL without its query or fragment. */
export const pathOf = (url: string) => url.split(/[?#]/)[0];

/** The tab a URL belongs to: its first segment (REDESIGN.md 2.4), which is also Ionic's stack id. */
export function tabOf(url: string): string {
  return pathOf(url).split('/').find(Boolean) ?? '';
}

/** Navigation state for a link to `target`: where it came from, when that is another tab (`app-back` returns there). */
export function crossState(router: Router, target: UrlTree | string): { from: string } | undefined {
  const url = typeof target === 'string' ? target : router.serializeUrl(target);
  return tabOf(url) === tabOf(router.url) ? undefined : { from: router.url };
}

/** Where a cross-section navigation came from (`crossState`'s `from`), when that lies in another tab than `url`. */
export function crossFrom(navigation: Navigation | null, url: string): string | null {
  const from: unknown = navigation?.extras.state?.['from'];
  return typeof from === 'string' && tabOf(from) !== tabOf(url) ? from : null;
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

type Direction = 'back' | 'root' | 'forward';

/**
 * Which shown views a link from another tab opened (REDESIGN.md 2.5), and each tab's last URL. Ionic reuses a view for a
 * URL it already holds and pops without navigation state, so this is kept per URL rather than per component: a link from
 * another tab marks the URL, any other forward or root navigation to it clears the mark, and a pop keeps it. `app-back`,
 * the swipe-back toggle and the tab buttons all read it.
 */
@Injectable({ providedIn: 'root' })
export class CrossSections {
  private readonly router = inject(Router);
  private readonly nav = inject(NavController);
  private readonly fromByUrl = new Map<string, string>();
  private readonly lastUrls = new Map<string, string>();
  /** Tabs a cross-section link entered: their last URL stays where the learner left them until the tab is selected. */
  private readonly entered = new Set<string>();
  private direction: Direction = 'forward';

  constructor() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) this.direction = this.directionOf(event);
      else if (event instanceof NavigationEnd) this.record(event.urlAfterRedirects);
    });
  }

  /** Where the view at `url` was opened from, when a link from another tab opened it. */
  from(url = this.router.url): string | null {
    return this.fromByUrl.get(url) ?? null;
  }

  lastUrl(tab: string): string {
    return this.lastUrls.get(tab) ?? `/${tab}`;
  }

  /** Forgets every tab's place, as when another learner takes over the device. */
  forget(): void {
    this.fromByUrl.clear();
    this.lastUrls.clear();
    this.entered.clear();
  }

  private directionOf(event: NavigationStart): Direction {
    if (event.navigationTrigger === 'popstate') return 'back';
    // Ionic's pops and back navigations set this just before they navigate; links leave it 'auto'.
    const set = (this.nav as unknown as { direction: string }).direction;
    return set === 'back' || set === 'root' ? set : 'forward';
  }

  private record(url: string): void {
    const tab = tabOf(url);
    const from = crossFrom(this.router.currentNavigation(), url);
    if (from) this.fromByUrl.set(url, from);
    else if (this.direction !== 'back') this.fromByUrl.delete(url);
    // A hub has no back button, so a link into it is an ordinary entry into its tab; only Android's back reads its origin.
    const hub = isHub(this.router.routerState.snapshot.root);
    if (from && !hub) {
      this.entered.add(tab);
      return;
    }
    if (this.direction === 'root') this.entered.delete(tab);
    if (!this.entered.has(tab) && (hub || !this.fromByUrl.has(url))) this.lastUrls.set(tab, url);
  }
}

/**
 * Forgets every tab's place when `identity` changes: a sign-in, a sign-out or deleted data. Not on its first read, and not
 * when a renewed session reports the same learner, which the auth service does on every token refresh.
 */
export function forgetOnChange(sections: CrossSections, identity: () => string): void {
  let last: string | undefined;
  effect(() => {
    const now = identity();
    if (last !== undefined && now !== last) untracked(() => sections.forget());
    last = now;
  });
}

/** Whether the shown page is a tab's hub: a tab root (Today, Mock) or a hub segment. */
function isHub(root: ActivatedRouteSnapshot): boolean {
  let route = root;
  while (route.firstChild) route = route.firstChild;
  const parent = route.parent?.routeConfig;
  return (parent?.path !== '' && parent?.children !== undefined) || route.routeConfig?.path === tabOf(route.routeConfig?.path ?? '');
}
