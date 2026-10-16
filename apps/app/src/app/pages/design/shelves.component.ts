import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CASE_CATALOG,
  LEVEL_PROFILES,
  SCENARIO_CATALOG,
  SD_SHELVES,
  SENIORITY_LEVELS,
  currentTarget,
  getScenarioSummary,
  getSdTopic,
  shelfCases,
  shelfMissions,
  shelfStretchAt,
  topicStatus,
  topicUses,
  type StatusContext,
} from '@grasp/engine';
import { motionScroll } from '../../core/motion';
import { ProgressService } from '../../core/progress.service';
import { ChipComponent } from '../../ui/chip.component';
import { EntryRowComponent } from '../../ui/entry-row.component';
import { SkillStateComponent } from '../../ui/skill-state.component';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const title = (id: string) => getScenarioSummary(id)?.title ?? id;
const topicName = (id: string) => getSdTopic(id)?.name ?? id;
const listed = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? ''));

/** What the page shows of each shelf that does not change with progress. */
const SHELVES = (() => {
  const missions = shelfMissions();
  return SD_SHELVES.map((s) => {
    const topics: readonly string[] = s.topics;
    const entry = missions.find((m) => m.shelf === s.id)!;
    const stretch = shelfStretchAt(s.id).map((level) => SENIORITY_LEVELS.find((l) => l.level === level)!.label);
    return {
      id: s.id,
      name: s.name,
      topics: topics.map((id) => {
        const uses = topicUses(id);
        return { id, name: topicName(id), level: getSdTopic(id)?.level === 'core' ? 'Core' : 'Advanced', ...uses };
      }),
      stretch: stretch.length ? `Stretch at ${listed(stretch)}` : '',
      home: entry.home.map((m) => ({ id: m.scenarioId, title: title(m.scenarioId), uses: `${m.topicIds.length} of ${topics.length}` })),
      also: entry.also.map((m) => ({ id: m.scenarioId, title: title(m.scenarioId), topics: m.topicIds.map(topicName).join(', ') })),
      cases: shelfCases(s.id).length,
    };
  });
})();

/**
 * The Design hub's Topics (REDESIGN.md 2.8, 4.5): the shelf overview, then the six shelves, each topic with its state and
 * where it is practised, each shelf ending with its home missions, the missions that also touch it and its cases.
 */
@Component({
  selector: 'app-design-shelves',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ChipComponent, EntryRowComponent, SkillStateComponent],
  template: `
    <div class="page">
      <h1>System design</h1>
      <p class="summary">
        @for (part of summary(); track $index; let last = $last) {
          <span>{{ part }}</span
          >{{ last ? '' : ' · ' }}
        }
      </p>
      <nav class="overview" aria-label="Shelves">
        <ul>
          @for (s of shelves; track s.id) {
            @let r = ready()[s.id];
            <li>
              <button type="button" class="tile" (click)="jump(s.id)">
                <span class="name">{{ s.name }}</span>
                <span class="count">Ready {{ r }} of {{ s.topics.length }}</span>
                <span class="bar" aria-hidden="true"><i [style.width.%]="(100 * r) / s.topics.length"></i></span>
              </button>
            </li>
          }
        </ul>
      </nav>
      <ul class="legend" aria-label="Key">
        @for (k of legend; track k) {
          <li><g-skill-state aria-hidden="true" [state]="k" />{{ names[k] }}</li>
        }
      </ul>
      <p class="key-note">
        A topic is Learning once you open its lesson, Practiced once a mission or case study that uses it is done, and Ready once its review
        cards are recalled too.
      </p>

      @if (shelvesShown()) {
        @for (s of shelves; track s.id) {
          <section class="shelf" [id]="'shelf-' + s.id" [attr.aria-labelledby]="'shelf-head-' + s.id">
            <div class="shelf-head">
              <h2 [id]="'shelf-head-' + s.id" tabindex="-1">{{ s.name }}</h2>
              <p>
                {{ s.topics.length }} topics
                @if (s.stretch) {
                  <span> · {{ s.stretch }}</span>
                }
              </p>
            </div>
            <ul class="topics">
              @for (t of s.topics; track t.id) {
                <li class="topic">
                  <a g-entry-row [heading]="t.name" [routerLink]="['/design/topics', t.id]">
                    <g-skill-state lead [state]="states()[t.id]" />
                    <g-chip end>{{ t.level }}</g-chip>
                  </a>
                  <p class="uses">
                    Used in
                    <a routerLink="/design/missions" [queryParams]="{ topic: t.id }" [replaceUrl]="true">{{
                      plural(t.missions.length, 'mission')
                    }}</a>
                    @if (t.cases.length) {
                      ·
                      <a routerLink="/design/cases" [queryParams]="{ topic: t.id }" [replaceUrl]="true">{{
                        plural(t.cases.length, 'case')
                      }}</a>
                    }
                  </p>
                </li>
              }
            </ul>
            <div class="foot">
              <h3>{{ s.home.length === 1 ? 'Home mission' : 'Home missions' }}</h3>
              <ul class="home">
                @for (m of s.home; track m.id) {
                  <li>
                    <a [routerLink]="['/design/missions', m.id]">{{ m.title }}</a>
                    <span class="muted">uses {{ m.uses }} topics</span>
                    @if (passed()[m.id]) {
                      <g-chip tone="success">Passed</g-chip>
                    }
                  </li>
                }
              </ul>
              @if (s.also.length) {
                <p class="also">
                  Also in:
                  @for (m of s.also; track m.id; let last = $last) {
                    <a [routerLink]="['/design/missions', m.id]">{{ m.title }}</a> ({{ m.topics }}){{ last ? '' : ',' }}
                  }
                </p>
              }
              <a class="cases" routerLink="/design/cases" [queryParams]="{ shelf: s.id }" [replaceUrl]="true"
                >Cases that use this shelf ({{ s.cases }}) →</a
              >
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: `
    @use '../../../breakpoints' as *;
    @use '../../../type' as *;

    .page {
      container-type: inline-size;
    }
    h1 {
      font-size: var(--g-text-display-l);
      margin: var(--g-space-1) 0 var(--g-space-1);
    }
    .summary {
      margin: 0 0 var(--g-space-4);
      color: var(--g-muted);
      font-size: var(--g-text-body-s);
      span {
        white-space: nowrap;
      }
    }
    /* Links in running lines keep their look but get a target at least 24px tall. */
    .uses a,
    .home a,
    .also a {
      padding-block: var(--g-space-1);
    }
    .overview ul,
    .legend,
    .topics,
    .home {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .overview ul {
      display: grid;
      gap: var(--g-space-2);
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    @include container-medium {
      .overview ul {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
    @include container-wide {
      .overview ul {
        grid-template-columns: repeat(6, minmax(0, 1fr));
      }
    }
    .tile {
      display: flex;
      flex-direction: column;
      gap: var(--g-space-1);
      width: 100%;
      height: 100%;
      padding: var(--g-space-2) var(--g-space-3);
      border: 1px solid var(--g-line);
      border-radius: var(--g-radius-sm);
      background: var(--g-surface);
      color: var(--g-text);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .tile .name {
      font-weight: 600;
      font-size: var(--g-text-body);
      line-height: 1.3;
    }
    .tile .count {
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
      font-variant-numeric: tabular-nums;
    }
    .bar {
      display: block;
      height: 4px;
      margin-top: auto;
      border-radius: var(--g-radius-pill);
      background: var(--g-sunken);
      overflow: hidden;
      i {
        display: block;
        height: 100%;
        background: var(--g-success-ink);
      }
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: var(--g-space-1) var(--g-space-4);
      margin-top: var(--g-space-5);
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
      li {
        display: inline-flex;
        align-items: center;
        gap: var(--g-space-1);
      }
    }
    .key-note {
      max-width: 70ch;
      margin: var(--g-space-2) 0 0;
      font-size: var(--g-text-body-s);
      line-height: 1.5;
      color: var(--g-muted);
    }
    .shelf {
      margin-top: var(--g-space-7);
      scroll-margin-top: var(--g-space-4);
    }
    .shelf-head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--g-space-1) var(--g-space-3);
      margin-bottom: var(--g-space-2);
      h2 {
        margin: 0;
        font-size: var(--g-text-title-l);
      }
      p {
        margin: 0;
        color: var(--g-muted);
        font-size: var(--g-text-body-s);
      }
    }
    .topics {
      display: grid;
      gap: var(--g-space-2);
      grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
    }
    .topic {
      display: flex;
      flex-direction: column;
      border-radius: var(--g-radius-sm);
      background: var(--g-sunken);
      a[g-entry-row] {
        background: transparent;
      }
    }
    .uses {
      margin: calc(-1 * var(--g-space-2)) 0 0;
      padding: 0 var(--g-space-3) var(--g-space-2) calc(var(--g-space-3) * 2 + 1.15em);
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
    }
    .foot {
      margin-top: var(--g-space-3);
      font-size: var(--g-text-body-s);
      h3 {
        @include label;
        margin: 0 0 var(--g-space-1);
        color: var(--g-muted);
      }
    }
    .home li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--g-space-1) var(--g-space-2);
      min-height: 32px;
      a {
        font-weight: 600;
      }
    }
    .also {
      margin: var(--g-space-1) 0 0;
      color: var(--g-muted);
      line-height: 1.5;
    }
    .cases {
      display: inline-block;
      margin-top: var(--g-space-1);
      padding-block: var(--g-space-1);
      font-weight: 600;
    }
  `,
})
export class ShelvesComponent {
  private readonly progress = inject(ProgressService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly shelves = SHELVES;
  readonly plural = plural;
  readonly legend = ['new', 'learning', 'practiced', 'ready'] as const;
  readonly names = { new: 'New', learning: 'Learning', practiced: 'Practiced', ready: 'Ready' } as const;

  /** The shelves render a frame after the overview, so a slow phone paints the first screen without building 34 rows first. */
  readonly shelvesShown = signal(false);

  constructor() {
    afterNextRender(() => requestAnimationFrame(() => this.shelvesShown.set(true)));
  }

  readonly states = computed(() => {
    const state = this.progress.state();
    // Topic states never read the story bank, which lives outside the event log.
    const ctx: StatusContext = { state, stories: [], now: this.progress.now(), profile: LEVEL_PROFILES[currentTarget(state).target.level] };
    return Object.fromEntries(SHELVES.flatMap((s) => s.topics).map((t) => [t.id, topicStatus(t.id, ctx).state]));
  });
  readonly ready = computed(() => {
    const states = this.states();
    return Object.fromEntries(SHELVES.map((s) => [s.id, s.topics.filter((t) => states[t.id] === 'ready').length]));
  });
  readonly passed = computed(() => this.progress.state().missions);
  readonly summary = computed(() => {
    const states = this.states();
    const core = SHELVES.flatMap((s) => s.topics).filter((t) => t.level === 'Core');
    const practiced = core.filter((t) => states[t.id] === 'practiced' || states[t.id] === 'ready').length;
    const state = this.progress.state();
    const missions = SCENARIO_CATALOG.filter((m) => state.missions[m.id]).length;
    const cases = CASE_CATALOG.filter((c) => state.cases[c.id]).length;
    return [
      `${practiced} of ${core.length} core topics Practiced`,
      `${missions} of ${SCENARIO_CATALOG.length} missions passed`,
      `${cases} of ${CASE_CATALOG.length} cases finished`,
    ];
  });

  jump(shelf: string) {
    const heading = this.host.nativeElement.querySelector<HTMLElement>(`#shelf-head-${shelf}`);
    heading?.closest('section')?.scrollIntoView({ behavior: motionScroll(), block: 'start' });
    heading?.focus({ preventScroll: true });
  }
}
