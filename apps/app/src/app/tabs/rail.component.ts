import { ChangeDetectionStrategy, Component, ElementRef, type Signal, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon, NavController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronForward, documentTextOutline, searchOutline, settingsOutline } from 'ionicons/icons';
import { pathOf, tabOf } from '../ui/cross-link.directive';
import { RAIL_SECTIONS, RAIL_UTILITIES, isUtility, railCurrent } from './rail';
import { ionicStack, openOnTodayStack } from './utility-nav';

/**
 * What the rail reads from and asks of the tabs page, which holds Ionic's tabs. An input whose type alone is imported, not
 * an injected token, which would put a module in both the tabs chunk and this lazy one and so split a first-paint file.
 */
export interface RailHost {
  url: Signal<string>;
  focusRoute: Signal<boolean>;
  railCollapsed: Signal<boolean>;
  due: Signal<number>;
  solved: Signal<string>;
  daysLeft: Signal<string | null>;
  selectTab(tab: string): void;
  /** Ionic's tabs outlet, whose private stack the rail trims when it opens a utility page. */
  outlet(): unknown;
  toggleRail(): void;
  openFeedback(): void;
  focusPageHeading(within?: Element): void;
}

/** A plain click, which the rail handles itself; a modified or middle click opens the link's href as the browser would. */
// ionicons' chatbox-ellipses-outline, kept here: every glyph imported from ionicons/icons ships in first paint, even a lazy
// chunk's, and only the rail uses this one.
const FEEDBACK_GLYPH =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512' class='ionicon'><path d='M408 64H104a56.16 56.16 0 0 0-56 56v192a56.16 56.16 0 0 0 56 56h40v80l93.72-78.14a8 8 0 0 1 5.13-1.86H408a56.16 56.16 0 0 0 56-56V120a56.16 56.16 0 0 0-56-56Z' stroke-linejoin='round' class='ionicon-fill-none ionicon-stroke-width'/><circle cx='160' cy='216' r='32'/><circle cx='256' cy='216' r='32'/><circle cx='352' cy='216' r='32'/></svg>";

const plainClick = (event: MouseEvent) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/**
 * The desktop rail (REDESIGN.md 2.6): plain HTML and CSS, shown from 1024px in place of the tab bar. Sections go through the
 * tabs page, which holds Ionic's tabs; sub-items and utilities navigate here.
 */
@Component({
  selector: 'app-rail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  host: { '[class.collapsed]': 'collapsed()' },
  template: `
    <nav aria-label="Main">
      <a class="skip" href="#" (click)="$event.preventDefault(); skip()">Skip to content</a>
      <p class="wordmark" aria-hidden="true">
        @if (collapsed()) {
          g<i>.</i>
        } @else {
          grasp<i>.</i>
        }
      </p>
      @if (!collapsed()) {
        <label class="search">
          <ion-icon name="search-outline" aria-hidden="true" />
          <input type="search" placeholder="Search" aria-label="Search" disabled />
          <kbd aria-hidden="true">Ctrl K</kbd>
        </label>
      }
      <ul>
        @for (s of sections; track s.tab) {
          <li>
            <a
              class="item section"
              [href]="'/' + s.tab"
              [attr.title]="collapsed() ? s.label : null"
              [attr.aria-label]="s.tab === 'today' && host().due() > 0 ? s.label + ', ' + host().due() + ' due' : null"
              [attr.aria-current]="current().section?.tab === s.tab ? current().section?.current : null"
              (click)="follow($event, () => host().selectTab(s.tab))"
            >
              <ion-icon [name]="s.icon" aria-hidden="true" />
              <span class="label">{{ s.label }}</span>
              @if (s.tab === 'today' && host().due() > 0) {
                <span class="badge" aria-hidden="true">{{ host().due() }}</span>
              }
            </a>
            @if (s.tab === active() && s.subs.length && !collapsed()) {
              <ul class="subs">
                @for (sub of s.subs; track sub.href) {
                  <li>
                    <a
                      class="item sub"
                      [href]="sub.href"
                      [attr.aria-current]="current().item === sub.href ? 'page' : null"
                      (click)="follow($event, () => openSegment(sub.href))"
                    >
                      <span class="label">{{ sub.label }}</span>
                      @if (sub.href === '/coding/problems') {
                        <span class="count">{{ host().solved() }}</span>
                      }
                    </a>
                  </li>
                }
              </ul>
            }
          </li>
        }
      </ul>
      <ul class="utilities">
        @for (u of utilities; track u.href) {
          <li>
            <a
              class="item"
              [href]="u.href"
              [attr.title]="collapsed() ? u.label : null"
              [attr.aria-current]="current().item === u.href ? 'page' : null"
              (click)="follow($event, () => openUtility(u.href))"
            >
              <ion-icon [name]="u.icon" aria-hidden="true" />
              <span class="label">{{ u.label }}</span>
              @if (u.href === '/today/plan' && host().daysLeft(); as left) {
                <span class="count">{{ left }}</span>
              }
            </a>
          </li>
        }
        <li>
          <button class="item" type="button" [attr.title]="collapsed() ? 'Send feedback' : null" (click)="host().openFeedback()">
            <ion-icon [icon]="feedbackGlyph" aria-hidden="true" />
            <span class="label">Send feedback</span>
          </button>
        </li>
      </ul>
      @if (host().focusRoute()) {
        <button class="item toggle" type="button" [attr.title]="collapsed() ? 'Expand menu' : null" (click)="host().toggleRail()">
          <ion-icon name="chevron-forward" aria-hidden="true" />
          <span class="label">{{ collapsed() ? 'Expand menu' : 'Collapse menu' }}</span>
        </button>
      }
    </nav>
  `,
  styles: `
    // Shown from 1024px only (the tabs page builds it there), beside the tabs, which start at its edge.
    :host {
      position: absolute;
      inset-block: 0;
      left: 0;
      width: 232px;
      display: flex;
      flex-direction: column;
      background: var(--g-surface);
      border-inline-end: 1px solid var(--g-line);
      padding: max(var(--g-space-3), env(safe-area-inset-top)) var(--g-space-2) max(var(--g-space-3), env(safe-area-inset-bottom));
      padding-inline-start: max(var(--g-space-2), env(safe-area-inset-left));
      overflow-y: auto;
    }
    nav {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: var(--g-space-1);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: calc(var(--g-space-1) / 2);
    }
    // Fixed, so the collapsed rail's scrolling box does not clip it.
    .skip {
      position: fixed;
      z-index: 1;
      white-space: nowrap;
      top: var(--g-space-2);
      left: var(--g-space-2);
      padding: var(--g-space-2) var(--g-space-3);
      border-radius: var(--g-radius-sm);
      background: var(--g-accent);
      color: var(--g-on-fill);
      font-weight: 600;
      &:not(:focus) {
        clip-path: inset(50%);
        width: 1px;
        height: 1px;
        overflow: hidden;
      }
    }
    .wordmark {
      margin: 0 0 var(--g-space-2);
      padding-inline: var(--g-space-3);
      font: 700 var(--g-text-display-l) var(--g-font-display);
      letter-spacing: -0.04em;
      i {
        font-style: normal;
        color: var(--g-predict);
      }
    }
    .search {
      display: flex;
      align-items: center;
      gap: var(--g-space-2);
      margin-bottom: var(--g-space-3);
      padding: var(--g-space-2) var(--g-space-3);
      border: 1px solid var(--g-line);
      border-radius: var(--g-radius-sm);
      background: var(--g-sunken);
      color: var(--g-muted);
      input {
        flex: 1;
        min-width: 0;
        border: 0;
        padding: 0;
        background: none;
        color: inherit;
        font: inherit;
        font-size: var(--g-text-body);
      }
      kbd {
        font: inherit;
        font-size: var(--g-text-label);
      }
    }
    // A count that does not fit beside its label takes a second line, so the label is never cut.
    .item {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      column-gap: var(--g-space-3);
      width: 100%;
      min-height: 40px;
      padding: var(--g-space-1) var(--g-space-3);
      border: 0;
      border-radius: var(--g-radius-sm);
      background: none;
      color: var(--g-muted);
      font: 500 var(--g-text-body) / 1.2 var(--ion-font-family);
      text-align: start;
      text-decoration: none;
      cursor: pointer;
      &:hover {
        background: rgba(var(--g-text-rgb), 0.06);
        color: var(--g-text);
      }
      &:focus-visible {
        outline-offset: -2px;
      }
      &[aria-current] {
        color: var(--g-text);
        font-weight: 600;
      }
      &[aria-current='page'] {
        background: var(--g-accent-soft);
      }
      ion-icon {
        flex: none;
        font-size: var(--g-text-title-l);
      }
    }
    .label {
      flex: 1 0 auto;
      white-space: nowrap;
    }
    .sub {
      min-height: 32px;
      padding-inline-start: calc(var(--g-space-3) * 2 + var(--g-space-5));
      font-size: var(--g-text-body-s);
    }
    .count {
      margin-inline-start: auto;
      white-space: nowrap;
      color: var(--g-muted);
      font-size: var(--g-text-label);
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
    .badge {
      min-width: 20px;
      padding: 0 var(--g-space-1);
      border-radius: var(--g-radius-pill);
      background: var(--g-predict);
      color: var(--g-on-fill);
      font-size: var(--g-text-label);
      font-weight: 600;
      line-height: 20px;
      text-align: center;
    }
    .utilities {
      margin-top: var(--g-space-2);
      padding-top: var(--g-space-2);
      border-top: 1px solid var(--g-line);
    }
    .toggle {
      margin-top: auto;
      ion-icon {
        transform: scaleX(-1);
      }
    }

    :host(.collapsed) {
      width: 64px;
      padding-inline: var(--g-space-2);
      .wordmark {
        padding: 0;
        text-align: center;
      }
      .item {
        position: relative;
        justify-content: center;
        padding: 0;
        &[aria-current] {
          background: var(--g-accent-soft);
        }
      }
      .label,
      .count {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }
      .badge {
        position: absolute;
        top: 0;
        right: 0;
      }
      .toggle ion-icon {
        transform: none;
      }
    }
  `,
})
export class RailComponent {
  readonly host = input.required<RailHost>();
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly router = inject(Router);
  private readonly navCtrl = inject(NavController);
  private opening = Promise.resolve();

  readonly feedbackGlyph = FEEDBACK_GLYPH;
  readonly sections = RAIL_SECTIONS;
  readonly utilities = RAIL_UTILITIES;
  readonly collapsed = computed(() => this.host().railCollapsed());
  readonly current = computed(() => railCurrent(this.host().url()));
  readonly active = computed(() => tabOf(this.host().url()));

  constructor() {
    addIcons({ searchOutline, settingsOutline, documentTextOutline, chevronForward });
  }

  follow(event: MouseEvent, go: () => void) {
    if (!plainClick(event)) return;
    event.preventDefault();
    go();
  }

  skip() {
    this.host().focusPageHeading(this.element.nativeElement);
  }

  /**
   * A sub-item: on its hub it replaces the URL, as the hub's own segment links do; above the hub it pops the stack to it,
   * since Ionic keys a hub's view by the hub's URL whatever its segment.
   */
  openSegment(href: string) {
    const path = pathOf(this.router.url);
    if (RAIL_SECTIONS.some((s) => s.subs.some((sub) => sub.href === href) && s.subs.some((sub) => sub.href === path)))
      void this.router.navigateByUrl(href, { replaceUrl: true });
    else void this.navCtrl.navigateBack(href);
  }

  /**
   * A utility (REDESIGN.md 2.6): one navigation, onto the Today stack under at most this one utility page. Openings run one
   * after another: a second one cancelling the first's navigation would have the first put back the views it took out.
   */
  openUtility(href: string): Promise<void> {
    this.opening = this.opening
      .then(async () => {
        if (pathOf(this.router.url) === href) return;
        await openOnTodayStack(ionicStack(this.host().outlet()), isUtility, (replaceUrl) =>
          this.navCtrl.navigateForward(href, { animated: false, replaceUrl }),
        );
      })
      .catch(() => undefined);
    return this.opening;
  }
}
