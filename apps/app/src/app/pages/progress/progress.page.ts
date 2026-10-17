import { formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, LOCALE_ID, computed, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import {
  CASE_CATALOG,
  CODING_CATALOG,
  COMPETENCY_CATALOG,
  INTERVIEW_TRACKS,
  QUESTIONS_PER_COMPETENCY,
  READINESS_BAND_NAMES,
  ROUND_NAMES,
  SCENARIO_CATALOG,
  SENIORITY_LEVELS,
  TRACK_NAMES,
  isRehearsable,
  loopArithmetic,
  loopReadiness,
  roundArithmetic,
  skillGrids,
  weakSpots,
  type Difficulty,
} from '@grasp/engine';
import { AuthService } from '../../core/auth.service';
import { ProgressService } from '../../core/progress.service';
import { ForecastComponent } from '../../review/forecast.component';
import { BackComponent } from '../../ui/back.component';
import { CrossLinkDirective } from '../../ui/cross-link.directive';
import { DisclosureComponent } from '../../ui/disclosure.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { StatComponent } from '../../ui/stat.component';
import { StarDraftsService } from '../behavioral/star-drafts.service';
import { StoryBankService } from '../behavioral/story-bank.service';
import { verdictName } from '../interview/mock-history';
import { DeviceWorkService } from '../today/device-work.service';
import { ReadinessRingComponent } from '../today/readiness-ring.component';
import { WeakSpotListComponent } from '../today/weak-spot-list.component';
import { WorkListComponent } from '../today/work-list.component';
import { STATE_NAMES, SkillGridComponent } from './skill-grid.component';

/** Progress lists this many weak spots; Today shows three. */
const WEAKEST = 5;
const DIFFICULTIES: { value: Difficulty; name: string }[] = [
  { value: 'easy', name: 'Easy' },
  { value: 'medium', name: 'Medium' },
  { value: 'hard', name: 'Hard' },
];
const pct = (share: number) => `${Math.round(share * 100)}%`;
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/**
 * Progress (REDESIGN.md 4.10): how the loop's readiness is made up, round by round and skill by skill, then problems, the
 * libraries, weak spots, review, mock rounds and unfinished work. Every state comes from the same functions as Today's
 * readiness (`skillGrids`, `loopReadiness`), so the totals here are the ones Today's ring counts.
 */
@Component({
  selector: 'app-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CrossLinkDirective,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonTitle,
    IonContent,
    BackComponent,
    PageHeaderComponent,
    DisclosureComponent,
    StatComponent,
    ForecastComponent,
    ReadinessRingComponent,
    SkillGridComponent,
    WeakSpotListComponent,
    WorkListComponent,
  ],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><app-back href="/today" /></ion-buttons>
        <ion-title>Progress</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="page narrow">
        <g-page-header heading="Progress" lede="Coverage of what your loop asks for, not a prediction of the result." />

        <g-disclosure summary="Loop readiness" [open]="true">
          @if (readiness(); as r) {
            <div class="loop">
              <app-readiness-ring [score]="r.score" [band]="band()" />
              <div>
                <p class="band">{{ band() }}</p>
                <p class="muted">{{ loopLine() }}</p>
              </div>
            </div>
            <p class="note">
              Each skill scores 0 when New, 25 when Learning, 60 when Practiced and 100 when Ready, and a round's score is their average.
            </p>
            <p class="note">
              Each round counts as often as your loop has it: <span class="sum">{{ arithmetic()?.text }}</span>
            </p>
            @for (g of grids(); track g.round) {
              <section class="round" [attr.aria-labelledby]="'round-' + g.round">
                <h2 [id]="'round-' + g.round">
                  {{ g.name }}
                  <span class="muted">{{ g.headline }}</span>
                </h2>
                @if (g.line) {
                  <p class="line">{{ g.line }}</p>
                }
                <app-skill-grid [skills]="g.skills" [label]="g.name + ' skills'" />
                @if (g.cases.length) {
                  <p class="sub">Required cases</p>
                  <app-skill-grid [skills]="g.cases" [label]="g.name + ' cases'" />
                }
              </section>
            }
            <ul class="legend" aria-label="Key">
              @for (k of legend; track k.state) {
                <li><span class="key" [class]="k.state" aria-hidden="true"></span>{{ k.name }}</li>
              }
              <li><span class="key stretch" aria-hidden="true"></span>Stretch at your level, not counted</li>
            </ul>
            @if (!auth.signedIn()) {
              <p class="note">
                Your stories are saved only on this device until you sign in, so Behavioral readiness counts this device's stories.
              </p>
            }
          } @else {
            <p class="muted">Loading…</p>
          }
        </g-disclosure>

        <g-disclosure summary="Problems" [open]="roomy">
          <dl class="facts">
            @for (d of problems(); track d.name) {
              <div>
                <dt>{{ d.name }}</dt>
                <dd>{{ d.solved }} of {{ d.total }} solved</dd>
              </div>
            }
          </dl>
          @if (attempted()) {
            <p class="note">{{ attempted() }} tried and not solved yet.</p>
          }
          <a class="more" routerLink="/coding/problems" crossLink>Open the problem library</a>
        </g-disclosure>

        <g-disclosure summary="Library" [open]="roomy">
          <dl class="facts">
            @for (f of library(); track f.name) {
              <div>
                <dt>{{ f.name }}</dt>
                <dd>{{ f.value }}</dd>
              </div>
            }
          </dl>
        </g-disclosure>

        <g-disclosure summary="Weak spots" [open]="roomy">
          @if (spots().length) {
            <app-weak-spot-list [spots]="spots()" />
          } @else {
            <p class="muted">
              Nothing stands out. A topic shows here when its predictions miss, a mock round flags it, or its review cards fade.
            </p>
          }
        </g-disclosure>

        <g-disclosure summary="Review" [open]="roomy">
          <div class="stats">
            <g-stat
              label="Review strength"
              [value]="strength()"
              hint="How much of the whole card library you hold firmly today; cards not yet learned count as 0"
            />
            <g-stat label="Retention (30 days)" [value]="retention()" hint="Reviews you got right" />
            <g-stat label="Streak" [value]="streak()" [hint]="longest()" />
            <g-stat label="XP" [value]="progress.state().xp" />
          </div>
          <p class="sub">Coming up</p>
          <g-forecast [days]="progress.forecast()" />
        </g-disclosure>

        <g-disclosure summary="Mock rounds" [open]="roomy">
          @if (mocks().length) {
            <dl class="facts">
              @for (m of mocks(); track m.name) {
                <div>
                  <dt>{{ m.name }}</dt>
                  <dd>{{ m.value }}</dd>
                </div>
              }
            </dl>
          } @else {
            <p class="muted">No mock rounds yet.</p>
          }
          <a class="more" routerLink="/mock" crossLink>Open Mock</a>
        </g-disclosure>

        <g-disclosure summary="Unfinished" [open]="roomy">
          @if (work().length) {
            <app-work-list [items]="work()" />
          } @else {
            <p class="muted">Nothing unfinished.</p>
          }
        </g-disclosure>
      </div>
    </ion-content>
  `,
  styles: `
    @use '../../../type' as *;

    g-disclosure {
      border-top: 1px solid var(--g-line);
    }
    g-page-header + g-disclosure {
      border-top: 0;
    }
    p {
      margin: 0 0 var(--g-space-3);
      line-height: 1.5;
    }
    .loop {
      display: flex;
      align-items: center;
      gap: var(--g-space-3);
      margin-bottom: var(--g-space-3);
      p {
        margin: 0;
      }
    }
    .band {
      font-weight: 600;
      font-size: var(--g-text-title-m);
    }
    .note,
    .line {
      font-size: var(--g-text-body);
    }
    .sum {
      font-variant-numeric: tabular-nums;
    }
    .round {
      margin: var(--g-space-5) 0 var(--g-space-3);
    }
    h2 {
      @include title;
      font-size: var(--g-text-title-m);
      margin: 0 0 var(--g-space-1);
      .muted {
        font-weight: 500;
        font-size: var(--g-text-body);
      }
    }
    .line {
      color: var(--g-muted);
      margin-bottom: var(--g-space-2);
    }
    .sub {
      @include label;
      color: var(--g-muted);
      margin: var(--g-space-3) 0 var(--g-space-2);
    }
    .legend {
      list-style: none;
      margin: var(--g-space-3) 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: var(--g-space-1) var(--g-space-4);
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
      li {
        display: inline-flex;
        align-items: center;
        gap: var(--g-space-2);
      }
    }
    .key {
      width: 0.9rem;
      height: 0.9rem;
      border: 1.5px solid var(--g-stroke);
      border-radius: var(--g-radius-xs);
    }
    .key.learning {
      border-color: var(--g-info-ink);
      background: linear-gradient(to top, var(--g-info-ink) 50%, transparent 50%);
    }
    .key.practiced {
      border-color: var(--g-info-ink);
      background: var(--g-info-ink);
    }
    .key.ready {
      border-color: var(--g-success-ink);
      background: var(--g-success-ink);
    }
    .key.stretch {
      border-style: dashed;
    }
    .facts {
      display: grid;
      gap: var(--g-space-2);
      margin: 0 0 var(--g-space-3);
      div {
        display: flex;
        justify-content: space-between;
        gap: var(--g-space-3);
        font-size: var(--g-text-body);
        padding-bottom: var(--g-space-2);
        border-bottom: 1px solid var(--g-line);
      }
      dt {
        font-weight: 600;
      }
      dd {
        margin: 0;
        color: var(--g-muted);
        text-align: right;
      }
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
      gap: var(--g-space-3);
      margin-bottom: var(--g-space-3);
    }
    .more {
      display: inline-block;
      font-weight: 600;
      font-size: var(--g-text-body);
      padding: var(--g-space-1) 0;
    }
  `,
})
export class ProgressPage {
  readonly progress = inject(ProgressService);
  readonly auth = inject(AuthService);
  private readonly bank = inject(StoryBankService);
  private readonly drafts = inject(StarDraftsService);
  private readonly device = inject(DeviceWorkService);
  private readonly locale = inject(LOCALE_ID);
  private readonly storiesLoaded = signal(false);
  /** On a phone only the first section starts open (REDESIGN.md 4.10); wider screens open them all. */
  readonly roomy = !matchMedia('(max-width: 560px)').matches;
  readonly legend = (['new', 'learning', 'practiced', 'ready'] as const).map((state) => ({ state, name: STATE_NAMES[state] }));

  private readonly now = computed(() => {
    this.progress.day();
    return untracked(this.progress.now);
  });
  readonly readiness = computed(() =>
    this.storiesLoaded() ? loopReadiness(this.progress.state(), this.bank.stories(), this.now()) : null,
  );
  readonly band = computed(() => READINESS_BAND_NAMES[this.readiness()?.band ?? 'building']);
  readonly arithmetic = computed(() => {
    const r = this.readiness();
    return r ? loopArithmetic(r) : null;
  });
  readonly loopLine = computed(() => {
    const r = this.readiness();
    if (!r) return '';
    const level = SENIORITY_LEVELS.find((l) => l.level === r.target.level)!.label;
    return r.source === 'set' ? `${level} loop` : `Assuming a ${level} loop`;
  });
  readonly grids = computed(() => {
    const r = this.readiness();
    if (!r) return [];
    return skillGrids(this.progress.state(), this.bank.stories(), this.now()).map((g) => {
      const round = r.rounds.find((x) => x.round === g.round);
      const name = ROUND_NAMES[g.round];
      const headline = round ? `${g.count > 1 ? `×${g.count} · ` : ''}${round.score}` : 'not in your loop';
      return { ...g, name, headline, line: round ? roundArithmetic(round) : null };
    });
  });

  readonly problems = computed(() => {
    const coding = this.progress.state().coding;
    return DIFFICULTIES.map(({ value, name }) => {
      const all = CODING_CATALOG.filter((p) => p.difficulty === value);
      return { name, total: all.length, solved: all.filter((p) => coding[p.id]?.solvedAt).length };
    });
  });
  readonly attempted = computed(() => Object.values(this.progress.state().coding).filter((r) => r.attempts > 0 && !r.solvedAt).length);
  readonly library = computed(() => {
    const state = this.progress.state();
    const stories = this.bank.stories();
    const questions = COMPETENCY_CATALOG.length * QUESTIONS_PER_COMPETENCY;
    return [
      { name: 'Missions passed', value: `${SCENARIO_CATALOG.filter((s) => state.missions[s.id]).length} of ${SCENARIO_CATALOG.length}` },
      { name: 'Cases finished', value: `${CASE_CATALOG.filter((c) => state.cases[c.id]).length} of ${CASE_CATALOG.length}` },
      { name: 'Answers drafted', value: `${this.drafts.count()} of ${questions}, on this device` },
      {
        name: 'Stories',
        value: stories.length ? `${stories.length} saved, ${stories.filter(isRehearsable).length} ready to rehearse` : 'None yet',
      },
    ];
  });
  readonly spots = computed(() => weakSpots(this.progress.state(), this.now(), WEAKEST));
  readonly strength = computed(() => {
    const list = this.progress.mastery();
    return pct(list.reduce((sum, m) => sum + m.mastery, 0) / Math.max(1, list.length));
  });
  readonly retention = computed(() => {
    const r = this.progress.retention();
    return r === null ? '–' : pct(r);
  });
  readonly streak = computed(() => days(this.progress.state().streak.current));
  readonly longest = computed(() => `Longest: ${days(this.progress.state().streak.longest)}`);
  readonly mocks = computed(() => {
    const { interviews, mockLoop } = this.progress.state();
    const day = (at: string) => formatDate(at, 'MMM d', this.locale);
    const rounds = INTERVIEW_TRACKS.flatMap((track) => {
      const last = interviews.byTrack[track];
      return last ? [{ name: TRACK_NAMES[track], value: `${verdictName(last.verdict)}, ${day(last.at)}` }] : [];
    });
    const loop = mockLoop ? [{ name: 'Mock loop', value: `${verdictName(mockLoop.verdict)}, ${day(mockLoop.completedAt)}` }] : [];
    return rounds.length || loop.length ? [...rounds, ...loop, { name: 'Rounds scored', value: String(interviews.total) }] : [];
  });
  readonly work = computed(() => (this.device.loaded() ? this.device.items(this.progress.state(), this.progress.state().plan?.level) : []));

  constructor() {
    void this.bank
      .load()
      .catch(() => undefined)
      .then(() => this.storiesLoaded.set(true));
    void this.drafts.load().catch(() => undefined);
    void this.device.load().catch(() => undefined);
  }

  ionViewWillEnter() {
    this.progress.now.set(new Date());
  }
}
