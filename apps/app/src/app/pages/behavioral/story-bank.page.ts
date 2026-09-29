import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { BANK_TARGET, getCompetencySummary, reviewStar, storyTitle, type Story } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { add, bulbOutline, chevronForward } from 'ionicons/icons';
import { StoryBankService } from './story-bank.service';

@Component({
  selector: 'app-story-bank',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonIcon],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/behavioral" text="" /></ion-buttons>
        <ion-title>Story bank</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="page narrow">
        <h1>Your story bank</h1>
        <p class="lead">
          Write each real experience once, tag the competencies it answers, and tell it for any of their questions.
          {{ target.min }} to {{ target.max }} stories cover a whole loop.
        </p>
        <button type="button" class="g-btn primary" (click)="create()"><ion-icon name="add" aria-hidden="true" />New story</button>

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
                  </span>
                  <ion-icon name="chevron-forward" aria-hidden="true" />
                </a>
              </li>
            }
          </ul>
        }
        <p class="saved muted">Saved on this device only.</p>
      </div>
    </ion-content>
  `,
  styles: `
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
  readonly target = BANK_TARGET;
  readonly stories = this.bank.stories;
  readonly review = this.bank.review;
  readonly rows = computed(() => this.stories().map((s) => this.row(s)));

  constructor() {
    addIcons({ add, bulbOutline, chevronForward });
  }

  ionViewWillEnter() {
    void this.bank.load();
  }

  create() {
    void this.router.navigate(['/behavioral/stories', this.bank.blank().id]);
  }

  private row(story: Story) {
    const checks = reviewStar(story.draft).checks;
    return {
      id: story.id,
      title: storyTitle(story),
      tags: story.competencyIds.map((id) => getCompetencySummary(id)?.name ?? id).join(', '),
      passing: checks.filter((c) => c.ok).length,
      total: checks.length,
    };
  }
}
