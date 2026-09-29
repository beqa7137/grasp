import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { COMPETENCY_CATALOG } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { chevronForward, libraryOutline } from 'ionicons/icons';
import { StarDraftsService } from './star-drafts.service';
import { StoryBankService } from './story-bank.service';

@Component({
  selector: 'app-behavioral-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonIcon],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/interview" text="" /></ion-buttons>
        <ion-title>Behavioral</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="page narrow">
        <h1>Behavioral interviews</h1>
        <p class="lead">
          Every loop has them, and at senior levels they often decide your level. Interviewers listen for what you did, how you decided and
          what changed because of it.
        </p>
        <section class="panel star">
          <h2>Answer with STAR</h2>
          <dl>
            <dt>Situation</dt>
            <dd>The context, in two sentences.</dd>
            <dt>Task</dt>
            <dd>What you owned and why it was hard.</dd>
            <dt>Action</dt>
            <dd>What you did, in the first person. Most of the answer.</dd>
            <dt>Result</dt>
            <dd>What changed, with a number.</dd>
            <dt>Reflection</dt>
            <dd>What you learned or would do differently.</dd>
          </dl>
        </section>
        <section class="panel prep">
          <h2>Before the loop</h2>
          <ul>
            <li>Build a bank of 8 to 10 stories from the last two or three years. Most stories answer two or three competencies.</li>
            <li>Pick stories whose scope matches the level you are interviewing for.</li>
            <li>"Tell me about yourself" and "Why this company?" are not STAR: answer each in 60 to 90 seconds.</li>
            <li>Rehearse aloud. Written answers run longer when spoken.</li>
            <li>Bring two or three questions for the interviewer.</li>
          </ul>
        </section>
        <a class="panel item bank" routerLink="/behavioral/stories">
          <ion-icon class="lead-icon" name="library-outline" aria-hidden="true" />
          <span class="text">
            <span class="name">Your story bank</span>
            <span class="one">{{ bankSummary() }}</span>
          </span>
          <ion-icon name="chevron-forward" aria-hidden="true" />
        </a>
        <h2 class="list-title">{{ competencies.length }} competencies</h2>
        <ul class="list">
          @for (c of competencies; track c.id) {
            @let drafted = drafts.draftedIn(c.id);
            <li>
              <a class="panel item" [routerLink]="['/behavioral', c.id]">
                <span class="text">
                  <span class="name">{{ c.name }}</span>
                  <span class="one">{{ c.oneLiner }}</span>
                  @if (drafted) {
                    <span class="drafted">{{ drafted }} {{ drafted === 1 ? 'answer' : 'answers' }} drafted</span>
                  }
                </span>
                <ion-icon name="chevron-forward" aria-hidden="true" />
              </a>
            </li>
          }
        </ul>
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
    .star,
    .prep {
      padding: 16px;
      margin-bottom: 16px;
    }
    .prep ul {
      margin: 0;
      padding-left: 18px;
    }
    .prep li {
      line-height: 1.55;
      margin-bottom: 4px;
      font-size: 0.90625rem;
    }
    h2 {
      font-size: 1rem;
      margin: 0 0 10px;
    }
    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 6px 14px;
      margin: 0;
      font-size: 0.90625rem;
      line-height: 1.5;
    }
    dt {
      font-weight: 600;
      color: var(--g-accent);
    }
    dd {
      margin: 0;
    }
    .bank {
      margin-bottom: 20px;
      .lead-icon {
        font-size: 22px;
        color: var(--g-accent);
      }
    }
    .list-title {
      margin-top: 4px;
    }
    .list {
      list-style: none;
      margin: 0;
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
    }
    .one {
      font-size: 0.875rem;
      color: var(--g-muted);
      line-height: 1.45;
    }
    .drafted {
      font-size: 0.8125rem;
      color: var(--g-accent);
    }
  `,
})
export class BehavioralListPage {
  readonly competencies = COMPETENCY_CATALOG;
  readonly drafts = inject(StarDraftsService);
  private readonly bank = inject(StoryBankService);
  readonly bankSummary = computed(() => {
    const count = this.bank.stories().length;
    const { covered, coverage } = this.bank.review();
    return count
      ? `${count} ${count === 1 ? 'story' : 'stories'}, covering ${covered} of ${coverage.length} competencies.`
      : 'Write each story once, tag its competencies, and see which ones still need one.';
  });

  constructor() {
    addIcons({ chevronForward, libraryOutline });
  }

  ionViewWillEnter() {
    void this.drafts.load();
    void this.bank.load();
  }
}
