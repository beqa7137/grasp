import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import {
  LEVEL_PROFILES,
  PATTERN_CATALOG,
  PATTERN_TRACKS,
  currentTarget,
  getAlgorithmSummary,
  getPatternSummary,
  patternNeighbours,
  patternStatus,
  problemsForPattern,
} from '@grasp/engine';
import { addIcons } from 'ionicons';
import { playCircle } from 'ionicons/icons';
import { refocus } from '../../core/focus';
import { ProgressService } from '../../core/progress.service';
import { BackComponent } from '../../ui/back.component';
import { SkillStateComponent } from '../../ui/skill-state.component';
import { SegmentMemory, type KeptSegment } from '../hub/segment-memory';

const STATE_NAMES = { new: 'New', learning: 'Learning', practiced: 'Practiced', ready: 'Ready' } as const;
const segmentLinks = (id: string) => {
  const base = `/coding/patterns/${id}`;
  return [base, `${base}/problems`, `${base}/drill`];
};

/** The Ionic hook a segment may keep from when it was a page of its own (the drill), and what it hands over to be kept. */
interface Segment extends KeptSegment {
  ionViewWillEnter?(): void;
}

/**
 * A pattern's hub (REDESIGN.md 4.3): its place in the roadmap, state and solved count over Lesson, Problems and Drill. As
 * the section hubs (2.5), it is one Ionic page whose segments render in a plain outlet, so switching segments neither
 * animates nor stacks a view; segment links replace the URL. Prev, Next and the footer replace the pattern too, so back
 * leaves for the Skill map rather than walking back through the roadmap.
 */
@Component({
  selector: 'app-pattern-hub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackComponent,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonTitle,
    IonContent,
    IonIcon,
    SkillStateComponent,
  ],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><app-back href="/coding" /></ion-buttons>
        <ion-title>{{ pattern()?.name }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      @if (pattern(); as p) {
        <div class="page narrow head">
          <p class="eyebrow">{{ trackName() }} · pattern {{ p.order }} of {{ patternCount }}</p>
          <h1>{{ p.name }}</h1>
          <p class="status">
            <g-skill-state aria-hidden="true" [state]="state()" /><span>{{ stateName() }}</span
            ><span class="solved">Solved {{ solved() }} of {{ problemCount() }}</span>
          </p>
          <div class="actions">
            @for (a of algorithms(); track a.id) {
              <a class="g-btn primary" [routerLink]="['/coding/visualizers', a.id]"
                ><ion-icon name="play-circle" aria-hidden="true" />Watch {{ a.title }} →</a
              >
            }
          </div>
          @if (neighbours().previous || neighbours().next) {
            <nav class="steps" [attr.aria-label]="trackName() + ' patterns'">
              @if (neighbours().previous; as prev) {
                <a class="prev" [routerLink]="['/coding/patterns', prev.id]" [replaceUrl]="true"
                  ><span class="visually-hidden">Previous: </span>← {{ prev.name }}</a
                >
              }
              @if (neighbours().next; as next) {
                <a class="next" [routerLink]="['/coding/patterns', next.id]" [replaceUrl]="true"
                  ><span class="visually-hidden">Next: </span>{{ next.name }} →</a
                >
              }
            </nav>
          }
          <nav class="segments" [attr.aria-label]="p.name + ' sections'">
            @for (s of segments(); track s.link) {
              <a
                class="chip"
                [routerLink]="s.link"
                [replaceUrl]="true"
                routerLinkActive
                [routerLinkActiveOptions]="exact"
                ariaCurrentWhenActive="page"
                >{{ s.label }}</a
              >
            }
          </nav>
        </div>
        <router-outlet (activate)="activate($event)" (deactivate)="memory.deactivated($event)" />
        @if (neighbours().following; as next) {
          <p class="page narrow footer">
            <a [routerLink]="['/coding/patterns', next.id]" [replaceUrl]="true">Next: {{ next.name }} →</a>
          </p>
        }
      }
    </ion-content>
  `,
  styles: `
    .head {
      padding-bottom: 0;
    }
    h1 {
      font-size: var(--g-text-display-xl);
      margin: var(--g-space-1) 0 var(--g-space-2);
    }
    .status {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--g-space-1) var(--g-space-2);
      margin: 0 0 var(--g-space-3);
      color: var(--g-muted);
      font-size: var(--g-text-body);
      .solved::before {
        content: '·';
        margin-right: var(--g-space-2);
      }
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--g-space-2);
      a {
        text-decoration: none;
      }
    }
    .steps {
      display: flex;
      flex-wrap: wrap;
      gap: var(--g-space-2) var(--g-space-4);
      margin-top: var(--g-space-3);
      font-size: var(--g-text-body-s);
      .next {
        margin-left: auto;
      }
    }
    .segments {
      display: flex;
      flex-wrap: wrap;
      gap: var(--g-space-2);
      margin-top: var(--g-space-4);
    }
    /* Segments start their own page with different first margins; under the row they all start at its padding. */
    :host ::ng-deep router-outlet + * > .page > :first-child {
      margin-top: 0;
    }
    .chip {
      padding: var(--g-space-2) var(--g-space-3);
      text-decoration: none;
      &[aria-current='page'] {
        background: var(--g-accent-soft);
        border-color: var(--g-accent);
        color: var(--g-text);
        font-weight: 600;
      }
    }
    .footer {
      padding-top: 0;
      font-weight: 600;
    }
    /* The drill's sticky rating bar measures itself into --actions-h; see its styles. */
    @media (max-width: 1023.98px) and (min-height: 480px) {
      ion-content::part(scroll) {
        scroll-padding-bottom: calc(var(--actions-h, 0px) + var(--offset-bottom, 0px));
      }
    }
  `,
})
export class PatternHubPage {
  readonly id = input.required<string>();
  private readonly progress = inject(ProgressService);
  readonly pattern = computed(() => getPatternSummary(this.id()));
  readonly patternCount = PATTERN_CATALOG.length;
  readonly trackName = computed(() => PATTERN_TRACKS.find((t) => t.id === this.pattern()?.track)?.name ?? '');
  readonly neighbours = computed(() => patternNeighbours(this.id()));
  readonly algorithms = computed(() => (this.pattern()?.algorithmIds ?? []).map((id) => getAlgorithmSummary(id)!).filter(Boolean));
  readonly problemCount = computed(() => problemsForPattern(this.id()).length);
  readonly solved = computed(() => {
    const coding = this.progress.state().coding;
    return problemsForPattern(this.id()).filter((p) => coding[p.id]?.solvedAt).length;
  });
  readonly state = computed(() => {
    const state = this.progress.state();
    const profile = LEVEL_PROFILES[currentTarget(state).target.level];
    return patternStatus(this.id(), { state, stories: [], now: this.progress.now(), profile }).state;
  });
  readonly stateName = computed(() => STATE_NAMES[this.state()]);
  readonly segments = computed(() => {
    const labels = ['Lesson', `Problems (${this.problemCount()})`, 'Drill'];
    return segmentLinks(this.id()).map((link, i) => ({ link, label: labels[i] }));
  });
  readonly exact = { paths: 'exact', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored' } as const;

  private segment: Segment | null = null;
  private entered = false;
  private readonly outlet = viewChild(RouterOutlet);
  private readonly content = viewChild(IonContent);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  // A hub shows one pattern: another pattern's URL is another page.
  readonly memory = new SegmentMemory(
    inject(Router),
    this.injector,
    segmentLinks(inject(ActivatedRoute).snapshot.paramMap.get('id') ?? ''),
  );

  constructor() {
    addIcons({ playCircle });
    afterNextRender(async () => {
      const content = this.content();
      if (content) this.memory.attach(await content.getScrollElement());
    });
  }

  activate(segment: Segment) {
    // A switch moves focus to the new segment's heading, as the section hubs do.
    if (this.segment) afterNextRender(() => this.focusHeading(), { injector: this.injector });
    this.segment = segment;
    const route = this.outlet()?.activatedRoute;
    if (route) this.memory.activated(segment, route);
    if (this.entered) segment.ionViewWillEnter?.();
  }

  private focusHeading() {
    const heading = this.host.nativeElement.querySelector<HTMLElement>('router-outlet + * :is(h1, h2)');
    if (heading && !heading.hasAttribute('tabindex')) heading.tabIndex = -1;
    refocus(heading);
  }

  ionViewWillEnter() {
    this.entered = true;
    this.segment?.ionViewWillEnter?.();
  }

  ionViewDidLeave() {
    this.entered = false;
  }
}
