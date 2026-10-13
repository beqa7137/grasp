import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import {
  BANK_TARGET,
  dueStories,
  getCompetencySummary,
  reviewStar,
  storyTitle,
  whenNext,
  type FlaggedCompetencies,
  type Story,
} from '@grasp/engine';
import { addIcons } from 'ionicons';
import { add, bulbOutline, chevronForward, micOutline } from 'ionicons/icons';
import { ProgressService } from '../../core/progress.service';
import { STORY_SYNC_NOTES, StoryBankService } from './story-bank.service';

@Component({
  selector: 'app-story-bank',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IonIcon],
  template: `
    <div class="page narrow">
      <h1>Your story bank</h1>
      <p class="lead">
        Write each real experience once, tag the competencies it answers, and tell it for any of their questions.
        {{ target.min }} to {{ target.max }} stories cover a whole loop.
      </p>
      <div class="actions">
        <button type="button" class="g-btn primary" (click)="create()"><ion-icon name="add" aria-hidden="true" />New story</button>
        @if (due()) {
          <a class="g-btn" routerLink="/behavioral/rehearse"><ion-icon name="mic-outline" aria-hidden="true" />Rehearse {{ due() }} due</a>
        }
      </div>

      <section class="coverage" aria-labelledby="coverage-title">
        <h2 id="coverage-title">{{ review().covered }} of {{ review().coverage.length }} competencies have a story</h2>
        <ul>
          @for (c of review().coverage; track c.competencyId) {
            <li [class.gap]="!c.storyIds.length">
              <a [routerLink]="['/behavioral', c.competencyId]">{{ c.name }}</a>
              <span class="n"
                >{{ c.storyIds.length }}<span class="visually-hidden"> {{ c.storyIds.length === 1 ? 'story' : 'stories' }}</span></span
              >
            </li>
          }
        </ul>
      </section>

      @if (review().advice.length) {
        <section class="panel advice">
          <h2><ion-icon name="bulb-outline" aria-hidden="true" />To do</h2>
          <ul>
            @for (a of review().advice; track a) {
              <li>{{ a }}</li>
            }
          </ul>
        </section>
      }

      @if (stories().length) {
        <h2 class="list-title">{{ stories().length }} {{ stories().length === 1 ? 'story' : 'stories' }}</h2>
        <ul class="list">
          @for (s of rows(); track s.id) {
            <li>
              <a class="panel item" [routerLink]="['/behavioral/stories', s.id]">
                <span class="text">
                  <span class="name">{{ s.title }}</span>
                  <span class="tags">{{ s.tags || 'No competencies yet' }}</span>
                  <span class="checks" [class.ok]="s.passing === s.total">{{ s.passing }} of {{ s.total }} checks pass</span>
                  <span class="when">Rehearse {{ s.when }}</span>
                </span>
                <ion-icon name="chevron-forward" aria-hidden="true" />
              </a>
            </li>
          }
        </ul>
      }
      <p class="saved muted">{{ saved() }}</p>
      @for (r of refusals(); track r.id) {
        <p class="saved muted">"{{ r.title }}" is saved on this device only: the account refused it, as {{ r.reason }}.</p>
      }
    </div>
  `,
  styles: `
    @use '../../../type' as *;

    h1 {
      font-size: clamp(1.625rem, 5vw, 2.25rem);
      margin: 8px 0 8px;
    }
    .lead {
      font-size: 1.0625rem;
      line-height: 1.55;
      margin: 0 0 16px;
    }
    h2 {
      @include title;
      font-size: 1rem;
      margin: 0 0 10px;
    }
    .coverage {
      margin: 24px 0 16px;
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 6px;
      }
      li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 12px;
        border-radius: var(--g-radius-sm);
        border: 1px solid var(--g-line-strong);
        font-size: 0.875rem;
        &.gap {
          border-style: dashed;
          color: var(--g-muted);
        }
      }
      a {
        color: inherit;
      }
      .n {
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
    }
    .advice {
      padding: 16px;
      margin-bottom: 16px;
      h2 {
        display: flex;
        align-items: center;
        gap: 8px;
        ion-icon {
          color: var(--g-accent);
        }
      }
      ul {
        margin: 0;
        padding-left: 18px;
      }
      li {
        line-height: 1.55;
        margin-bottom: 4px;
        font-size: 0.90625rem;
      }
    }
    .list {
      list-style: none;
      margin: 0 0 12px;
      padding: 0;
      display: grid;
      gap: 8px;
    }
    .item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      color: inherit;
      text-decoration: none;
      ion-icon {
        flex: none;
        color: var(--g-muted);
      }
    }
    .text {
      display: grid;
      gap: 2px;
      min-width: 0;
      flex: 1;
    }
    .name {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .tags {
      font-size: 0.875rem;
      color: var(--g-muted);
      line-height: 1.45;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .when {
      font-size: 0.8125rem;
      color: var(--g-muted);
    }
    .checks {
      font-size: 0.8125rem;
      color: var(--g-warn-ink);
      &.ok {
        color: var(--g-found-ink);
      }
    }
    .saved {
      font-size: 0.8125rem;
    }
  `,
})
export class StoryBankPage {
  private readonly bank = inject(StoryBankService);
  private readonly router = inject(Router);
  private readonly progress = inject(ProgressService);
  readonly target = BANK_TARGET;
  readonly stories = this.bank.stories;
  readonly review = this.bank.review;
  readonly saved = computed(() => STORY_SYNC_NOTES[this.bank.sync()]);
  readonly refusals = computed(() => this.bank.refusals().map(({ story, reason }) => ({ id: story.id, title: storyTitle(story), reason })));
  readonly rows = computed(() => {
    const now = new Date();
    const flagged = this.progress.state().behavioral;
    return this.stories().map((s) => this.row(s, now, flagged));
  });
  readonly due = computed(() => dueStories(this.stories(), new Date(), this.progress.state().behavioral).length);

  constructor() {
    addIcons({ add, bulbOutline, chevronForward, micOutline });
  }

  ionViewWillEnter() {
    void this.bank.load();
  }

  create() {
    void this.router.navigate(['/behavioral/stories', this.bank.blank().id]);
  }

  private row(story: Story, now: Date, flagged: FlaggedCompetencies) {
    const checks = reviewStar(story.draft).checks;
    return {
      id: story.id,
      title: storyTitle(story),
      tags: story.competencyIds.map((id) => getCompetencySummary(id)?.name ?? id).join(', '),
      passing: checks.filter((c) => c.ok).length,
      total: checks.length,
      when: whenNext(story, now, flagged),
    };
  }
}
