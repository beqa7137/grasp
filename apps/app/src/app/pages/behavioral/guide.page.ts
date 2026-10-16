import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import { BackComponent } from '../../ui/back.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { SectionComponent } from '../../ui/section.component';

/** How to answer a behavioral question, and what to do before the loop (REDESIGN.md 2.8): moved off the hub's top. */
@Component({
  selector: 'app-behavioral-guide',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BackComponent, PageHeaderComponent, SectionComponent, IonHeader, IonToolbar, IonButtons, IonTitle, IonContent],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><app-back href="/behavioral" /></ion-buttons>
        <ion-title>How to answer (STAR)</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="page narrow">
        <g-page-header
          heading="How to answer (STAR)"
          lede="Every loop has behavioral rounds, and at senior levels they often decide your level. Interviewers listen for what you did, how you decided and what changed because of it."
        />
        <g-section heading="Answer with STAR">
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
        </g-section>
        <g-section heading="Before the loop">
          <ul>
            <li>Build a bank of 8 to 10 stories from the last two or three years. Most stories answer two or three competencies.</li>
            <li>Pick stories whose scope matches the level you are interviewing for.</li>
            <li>"Tell me about yourself" and "Why this company?" are not STAR: answer each in 60 to 90 seconds.</li>
            <li>Rehearse aloud. Written answers run longer when spoken.</li>
            <li>Bring two or three questions for the interviewer.</li>
          </ul>
        </g-section>
        <ul class="next">
          <li><a routerLink="/behavioral/stories">Write your stories →</a></li>
          <li><a routerLink="/behavioral/questions">Practice the questions →</a></li>
          <li><a routerLink="/behavioral/drill">STAR drill: 3 questions with follow-ups, checks at the end, no verdict →</a></li>
        </ul>
      </div>
    </ion-content>
  `,
  styles: `
    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: var(--g-space-2) var(--g-space-4);
      margin: 0 0 var(--g-space-2);
      line-height: 1.5;
    }
    dt {
      font-weight: 600;
      color: var(--g-accent);
    }
    dd {
      margin: 0;
    }
    g-section ul {
      margin: 0 0 var(--g-space-2);
      padding-left: var(--g-space-5);
      line-height: 1.55;
    }
    g-section li + li {
      margin-top: var(--g-space-1);
    }
    .next {
      display: grid;
      gap: var(--g-space-1);
      margin: 0;
      padding: 0;
      list-style: none;
      a {
        display: inline-block;
        padding-block: var(--g-space-1);
        font-weight: 600;
      }
    }
  `,
})
export class GuidePage {}
