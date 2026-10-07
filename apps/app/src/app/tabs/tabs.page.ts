import { Component, DestroyRef, ElementRef, Injector, computed, effect, inject, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, type ActivatedRouteSnapshot } from '@angular/router';
import { IonBadge, IonIcon, IonLabel, IonModal, IonTabBar, IonTabButton, IonTabs, Config, NavController, Platform } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chatbubblesOutline, codeSlashOutline, gitNetworkOutline, peopleOutline, todayOutline } from 'ionicons/icons';
import { AuthService } from '../core/auth.service';
import { refocusAfterRender } from '../core/focus';
import { isOnHiddenPage } from '../core/page-keys';
import { ProgressService } from '../core/progress.service';
import { FeedbackSheetComponent } from '../pilot/feedback-sheet.component';
import { PilotNoticeComponent } from '../pilot/pilot-notice.component';
import { PilotService } from '../pilot/pilot.service';
import { CrossSections } from '../ui/cross-link.directive';
import { hardwareBack } from './hardware-back';

@Component({
  selector: 'app-tabs',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonBadge, IonModal, FeedbackSheetComponent, PilotNoticeComponent],
  template: `
    <ion-tabs (ionTabsWillChange)="noteNavFocus()" (ionTabsDidChange)="keepFocusOnPage()">
      <nav #nav aria-label="Main" [class.focus-route]="focusRoute()">
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
  `,
  styles: `
    @media (max-width: 1023.98px) {
      nav.focus-route {
        display: none;
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
export class TabsPage {
  private readonly progress = inject(ProgressService);
  readonly pilot = inject(PilotService);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly nav = viewChild.required<ElementRef<HTMLElement>>('nav');
  private readonly tabs = viewChild.required(IonTabs);
  private readonly navCtrl = inject(NavController);
  private navHadFocus = false;
  /** A focus route (2.6) gives its page the tab bar's height under 1024px; its own dock sits on the bottom safe area instead. */
  readonly focusRoute = computed(() => {
    // Read only to depend on it: the snapshot is not a signal, so each navigation's start and end re-run this.
    this.router.currentNavigation();
    let route: ActivatedRouteSnapshot = this.router.routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    return route.data['focus'] === true;
  });
  readonly due = this.progress.reviewDue;
  private readonly sections = inject(CrossSections);
  /** Ionic's own default, as its outlet applies it: the outlet has no getter to read it back. */
  private readonly swipe = inject(Config).getBoolean('swipeBackEnabled', true);

  constructor() {
    addIcons({ todayOutline, codeSlashOutline, gitNetworkOutline, peopleOutline, chatbubblesOutline });
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      // iOS swipe-back follows the outlet's stack, which would disagree with `app-back`, so it is off on a cross-section view.
      if (event instanceof NavigationEnd) this.tabs().outlet.swipeGesture = this.swipe && !this.sections.from(event.urlAfterRedirects);
    });
    const auth = inject(AuthService);
    // Signing out or deleting the learner's data starts every tab afresh.
    effect(() => {
      auth.user();
      this.progress.cleared();
      untracked(() => this.sections.forget());
    });
    const android = inject(Platform).backButton.subscribeWithPriority(10, () =>
      hardwareBack(document, {
        url: this.router.url,
        goToday: () => void this.navCtrl.navigateRoot('/today', { animated: true, animationDirection: 'back' }),
        // Minimizing is Android's; the web build has nothing to leave.
        leave: () => void import('@capacitor/app').then(({ App }) => App.minimizeApp().catch(() => App.exitApp().catch(() => undefined))),
      }),
    );
    inject(DestroyRef).onDestroy(() => android.unsubscribe());
  }

  /**
   * Ionic restores a tab at its top view's URL, which for a hub is the hub's own URL, losing its segment (REDESIGN.md 2.5's
   * spike). So a tab opens at the last URL it showed. A view another tab's link opened is not recorded, so the tab returns
   * to where the learner left it. Selecting the current tab still returns to its root, Ionic's way.
   */
  select(event: Event) {
    event.stopPropagation();
    const { tab } = (event as CustomEvent<{ tab: string }>).detail;
    if (this.tabs().getSelected() === tab) void this.tabs().select(tab);
    else void this.navCtrl.navigateRoot(this.sections.lastUrl(tab), { animated: true, animationDirection: 'back' });
  }

  /**
   * The welcome dialog opens on load, so no control opened it to take focus back: the page's heading takes it instead.
   * Ionic still traps focus in the dialog while didDismiss runs, hence the wait for the next render.
   */
  focusPageHeading(within?: Element) {
    refocusAfterRender(
      this.injector,
      () => {
        const heading = [...document.querySelectorAll<HTMLElement>('ion-router-outlet h1')].find((h) => !isOnHiddenPage(h));
        if (heading) heading.tabIndex = -1;
        return heading;
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
