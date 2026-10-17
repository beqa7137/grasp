import { NgComponentOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  type Type,
  ViewContainerRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, type ActivatedRouteSnapshot } from '@angular/router';
import { IonBadge, IonIcon, IonLabel, IonModal, IonTabBar, IonTabButton, IonTabs, Config, NavController, Platform } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chatbubblesOutline, codeSlashOutline, gitNetworkOutline, peopleOutline, todayOutline } from 'ionicons/icons';
import { AuthService } from '../core/auth.service';
import { refocusAfterRender } from '../core/focus';
import { isOnHiddenPage } from '../core/page-keys';
import { ProgressService } from '../core/progress.service';
import { ShortcutsService } from '../core/shortcuts.service';
import { FeedbackSheetComponent } from '../pilot/feedback-sheet.component';
import { PilotNoticeComponent } from '../pilot/pilot-notice.component';
import { PilotService } from '../pilot/pilot.service';
import type { ShowPalette } from '../search/search-palette.component';
import { isSearchChordStart, isSearchKey, searchKeyHint } from '../search/search-keys';
import { CrossSections, crossState, forgetOnChange, pathOf } from '../ui/cross-link.directive';
import { hardwareBack } from './hardware-back';
import type { RailHost } from './rail.component';
import { daysLeft, problemsSolved } from './rail-counts';
import { RailPrefsService } from './rail-prefs';

@Component({
  selector: 'app-tabs',
  imports: [
    IonTabs,
    IonTabBar,
    IonTabButton,
    IonIcon,
    IonLabel,
    IonBadge,
    IonModal,
    FeedbackSheetComponent,
    PilotNoticeComponent,
    NgComponentOutlet,
  ],
  host: { '[class.rail-collapsed]': 'railCollapsed()', '[class.rail-failed]': 'railFailed()' },
  template: `
    @if (desktop() && rail(); as railComponent) {
      <ng-container *ngComponentOutlet="railComponent; inputs: railInputs" />
    }
    <ion-tabs (ionTabsWillChange)="noteNavFocus()" (ionTabsDidChange)="keepFocusOnPage()">
      <nav #nav class="tab-bar" aria-label="Main" [class.focus-route]="focusRoute()">
        <ion-tab-bar slot="bottom" (ionTabButtonClick)="select($event)">
          <ion-tab-button tab="today" href="/today">
            <ion-icon name="today-outline" aria-hidden="true" />
            <ion-label>Today</ion-label>
            @if (due() > 0) {
              <ion-badge
                ><span aria-hidden="true">{{ due() }}</span
                ><span class="visually-hidden">, {{ due() }} due</span></ion-badge
              >
            }
          </ion-tab-button>
          <ion-tab-button tab="coding" href="/coding">
            <ion-icon name="code-slash-outline" aria-hidden="true" />
            <ion-label>Coding</ion-label>
          </ion-tab-button>
          <ion-tab-button tab="design" href="/design">
            <ion-icon name="git-network-outline" aria-hidden="true" />
            <ion-label>Design</ion-label>
          </ion-tab-button>
          <ion-tab-button tab="behavioral" href="/behavioral">
            <ion-icon name="people-outline" aria-hidden="true" />
            <ion-label>Behavioral</ion-label>
          </ion-tab-button>
          <ion-tab-button tab="mock" href="/mock">
            <ion-icon name="chatbubbles-outline" aria-hidden="true" />
            <ion-label>Mock</ion-label>
          </ion-tab-button>
        </ion-tab-bar>
      </nav>
    </ion-tabs>

    <ion-modal class="g-dialog" aria-label="Send feedback" [isOpen]="pilot.feedbackOpen()" (didDismiss)="pilot.feedbackOpen.set(false)">
      <ng-template>
        <app-feedback-sheet (closed)="pilot.feedbackOpen.set(false)" />
      </ng-template>
    </ion-modal>

    <ion-modal
      class="g-dialog"
      aria-label="Welcome to the Grasp pilot"
      [isOpen]="pilot.noticeOpen()"
      [backdropDismiss]="false"
      (didDismiss)="focusPageHeading()"
    >
      <ng-template>
        <app-pilot-notice (acknowledged)="pilot.acknowledgeNotice()" />
      </ng-template>
    </ion-modal>
    <ng-container #searchHost />
  `,
  styles: `
    @use '../../breakpoints' as *;

    $rail: 232px;
    $rail-collapsed: 64px;

    @include tabs {
      nav.focus-route {
        display: none;
      }
    }
    // From 1024px the rail replaces the tab bar (REDESIGN.md 2.6). The tabs start at its edge, so every page, and every
    // container query in it, sees the width the rail leaves.
    @include desktop {
      nav.tab-bar {
        display: none;
      }
      ion-tabs {
        left: $rail;
        width: auto;
      }
      :host(.rail-collapsed) ion-tabs {
        left: $rail-collapsed;
      }
      // Without its chunk (offline on a first visit) the tab bar stays, so there is always a way around.
      :host(.rail-failed) {
        nav.tab-bar {
          display: block;
        }
        ion-tabs {
          left: 0;
          width: 100%;
        }
      }
    }
    ion-badge {
      --background: var(--g-predict);
      --color: var(--g-on-fill);
      font-size: 10px;
      min-width: 16px;
    }
  `,
})
export class TabsPage implements RailHost {
  private readonly progress = inject(ProgressService);
  readonly pilot = inject(PilotService);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly nav = viewChild.required<ElementRef<HTMLElement>>('nav');
  private readonly tabs = viewChild.required(IonTabs);
  private readonly navCtrl = inject(NavController);
  private navHadFocus = false;
  /**
   * A focus route (2.6) gives its page the tab bar's height under 1024px, where its own dock sits on the bottom safe area
   * instead, and from 1024px the rail's width.
   */
  readonly focusRoute = computed(() => {
    // Read only to depend on it: the snapshot is not a signal, so each navigation's start and end re-run this.
    this.router.currentNavigation();
    let route: ActivatedRouteSnapshot = this.router.routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    return route.data['focus'] === true;
  });
  readonly due = this.progress.reviewDue;
  readonly url = signal(this.router.url);
  /** The rail is only built where it shows, so a phone's first paint spends nothing on it. */
  readonly desktop = signal(false);
  /** The rail's own chunk, loaded only from 1024px, so phones never fetch or build it. */
  readonly rail = signal<Type<unknown> | null>(null);
  readonly railFailed = signal(false);
  readonly railInputs = { host: this };
  readonly railPrefs = inject(RailPrefsService);
  /** Focus routes collapse the rail to its icons (REDESIGN.md 2.6), unless the learner expanded it there on this device. */
  readonly railCollapsed = computed(() => this.focusRoute() && this.railPrefs.collapsed());
  readonly solved = computed(() => problemsSolved(this.progress.state().coding));
  readonly daysLeft = computed(() => {
    const date = this.progress.state().plan?.interviewDate;
    return date ? daysLeft(date, this.progress.day()) : null;
  });
  private readonly sections = inject(CrossSections);
  /** Ionic's own default, as its outlet applies it: the outlet has no getter to read it back. */
  private readonly swipe = inject(Config).getBoolean('swipeBackEnabled', true);
  private readonly searchHost = viewChild.required('searchHost', { read: ViewContainerRef });
  private palette: Promise<ShowPalette> | null = null;
  readonly searchKeyHint = searchKeyHint();

  constructor() {
    addIcons({ todayOutline, codeSlashOutline, gitNetworkOutline, peopleOutline, chatbubblesOutline });
    const wide = matchMedia('(min-width: 1024px)');
    const follow = () => {
      this.desktop.set(wide.matches);
      if (wide.matches && !this.rail())
        void import('./rail.component').then(
          (m) => {
            this.railFailed.set(false);
            this.rail.set(m.RailComponent);
          },
          () => this.railFailed.set(true),
        );
    };
    follow();
    wide.addEventListener('change', follow);
    const host: Element = inject(ElementRef).nativeElement;
    const shortcuts = inject(ShortcutsService);
    const keys = (e: KeyboardEvent) => {
      if (isSearchChordStart(e)) {
        if (this.desktop()) this.prepareSearch();
      } else if (isSearchKey(host, e, shortcuts.characterKeys())) {
        e.preventDefault();
        this.openSearch(document.activeElement instanceof HTMLElement ? document.activeElement : null);
      }
    };
    document.addEventListener('keydown', keys);
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (!(event instanceof NavigationEnd)) return;
      this.url.set(event.urlAfterRedirects);
      // iOS swipe-back follows the outlet's stack, which would disagree with `app-back`, so it is off on a cross-section view.
      this.tabs().outlet.swipeGesture = this.swipe && !this.sections.from(event.urlAfterRedirects);
    });
    const auth = inject(AuthService);
    // Signing out or deleting the learner's data starts every tab afresh.
    forgetOnChange(this.sections, () => `${auth.user()?.id ?? ''} ${this.progress.cleared()}`);
    const android = inject(Platform).backButton.subscribeWithPriority(10, () =>
      hardwareBack(document, {
        url: this.router.url,
        from: this.sections.from(),
        goBack: (url) => void this.navCtrl.navigateBack(url),
        goToday: () => void this.navCtrl.navigateRoot('/today', { animated: true, animationDirection: 'back' }),
        // Minimizing is Android's; the web build has nothing to leave.
        leave: () => void import('@capacitor/app').then(({ App }) => App.minimizeApp().catch(() => App.exitApp().catch(() => undefined))),
      }),
    );
    inject(DestroyRef).onDestroy(() => {
      android.unsubscribe();
      wide.removeEventListener('change', follow);
      document.removeEventListener('keydown', keys);
    });
  }

  select(event: Event) {
    event.stopPropagation();
    this.selectTab((event as CustomEvent<{ tab: string }>).detail.tab);
  }

  toggleRail() {
    this.railPrefs.setCollapsed(!this.railPrefs.collapsed());
  }

  openFeedback() {
    this.pilot.feedbackOpen.set(true);
  }

  /**
   * A tab button or a rail section (REDESIGN.md 2.6). Ionic restores a tab at its top view's URL, which for a hub is the
   * hub's own URL, losing its segment (2.5's spike). So a tab opens at the last URL it showed; a view another tab's link
   * opened is not recorded, so the tab returns to where the learner left it. Selecting the current tab returns to its root:
   * above the hub Ionic pops to it, and on a hub segment, which Ionic counts as the root already, the hub's first segment
   * replaces it, as its segment links do.
   */
  selectTab(tab: string) {
    const outlet = this.tabs().outlet;
    const root = `/${tab}`;
    if (this.tabs().getSelected() !== tab)
      void this.navCtrl.navigateRoot(this.sections.lastUrl(tab), { animated: true, animationDirection: 'back' });
    else if (outlet.getLastUrl(tab) !== root) void this.tabs().select(tab);
    else if (pathOf(this.router.url) !== root) void this.router.navigateByUrl(root, { replaceUrl: true });
  }

  outlet(): unknown {
    return this.tabs().outlet;
  }

  /** Starts loading the palette, which a phone never needs: it searches on its own page. */
  prepareSearch(): Promise<ShowPalette> {
    this.palette ??= import('../search/search-palette.component').then(
      (m) => m.attachPalette(this.searchHost(), () => this.focusPageHeading()),
      (error: unknown) => {
        this.palette = null;
        throw error;
      },
    );
    return this.palette;
  }

  /**
   * Search (REDESIGN.md 2.9): the palette from 1024px, its page below, where an overlay fights the phone's keyboard. Focus
   * returns to `launcher` when the palette closes. Without the palette's code (offline on a first visit) the page opens.
   */
  openSearch(launcher: HTMLElement | null): void {
    const page = () => void this.router.navigateByUrl('/today/search', { state: crossState(this.router, '/today/search') });
    if (!this.desktop()) return page();
    this.prepareSearch().then((show) => show(launcher), page);
  }

  /**
   * The welcome dialog opens on load, so no control opened it to take focus back: the page's heading takes it instead.
   * Ionic still traps focus in the dialog while didDismiss runs, hence the wait for the next render.
   */
  focusPageHeading(within?: Element) {
    refocusAfterRender(
      this.injector,
      () => {
        // A page without a heading (an interview session) gives its main content focus instead.
        const target = ['ion-router-outlet h1', 'ion-router-outlet ion-content']
          .map((selector) => [...document.querySelectorAll<HTMLElement>(selector)].find((e) => !isOnHiddenPage(e)))
          .find(Boolean);
        if (target) target.tabIndex = -1;
        return target;
      },
      within,
    );
  }

  noteNavFocus() {
    this.navHadFocus = this.nav().nativeElement.contains(document.activeElement);
  }

  /**
   * A tab button can switch to a focus route, which hides the tab bar under 1024px and with it the focused button. Only then
   * does the page's heading take focus: on a first load or a link focus starts on the page, where the page keeps it.
   */
  keepFocusOnPage() {
    const nav = this.nav().nativeElement;
    if (this.navHadFocus && getComputedStyle(nav).display === 'none') this.focusPageHeading(nav);
  }
}
