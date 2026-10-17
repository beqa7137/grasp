import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import {
  PATTERN_CATALOG,
  getAlgorithmSummary,
  getLesson,
  getPattern,
  getProblemSummary,
  itemsForTopic,
  problemsForPattern,
} from '@grasp/engine';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  chatbubblesOutline,
  codeSlashOutline,
  gitBranchOutline,
  playCircle,
  schoolOutline,
  searchOutline,
} from 'ionicons/icons';
import { ProgressService } from '../../core/progress.service';
import { CodePanelComponent } from '../../viz/code-panel.component';
import { CodeTextComponent } from '../../viz/code-text.component';
import { MasteryRingComponent } from '../../ui/mastery-ring.component';
import { QuickCheckComponent } from './quick-check.component';
import { WorkedExampleComponent } from './worked-example.component';
import { BackComponent } from '../../ui/back.component';
import { drillIcon, quickCheckIcon } from '../../ui/icons';

@Component({
  selector: 'app-pattern',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackComponent,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonTitle,
    IonContent,
    IonIcon,
    CodePanelComponent,
    CodeTextComponent,
    MasteryRingComponent,
    WorkedExampleComponent,
    QuickCheckComponent,
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
        @let m = progress.masteryOf(p.id);
        <div class="page narrow">
          <section class="head">
            <g-mastery-ring [value]="m?.mastery ?? 0" [size]="64" />
            <div>
              <p class="eyebrow">
                Pattern {{ p.order }} of {{ patternCount }} · <span class="complexity">{{ p.complexity }}</span>
              </p>
              <h1>{{ p.name }}</h1>
            </div>
          </section>
          <p class="one"><g-code-text [text]="p.oneLiner" /></p>

          <div class="actions">
            @for (a of algorithms(); track a.id) {
              <a class="g-btn primary" [routerLink]="['/coding/visualizers', a.id]"
                ><ion-icon name="play-circle" aria-hidden="true" />Watch: {{ a.title }}</a
              >
            }
            <a class="g-btn" [routerLink]="['/coding/patterns', p.id, 'drill']"
              ><ion-icon [icon]="icons.drill" aria-hidden="true" />Drill {{ itemCount() }} cards</a
            >
            @for (c of problems(); track c.id) {
              <a class="g-btn" [routerLink]="['/coding/problems', c.id]"
                ><ion-icon name="code-slash-outline" aria-hidden="true" />Code: {{ c.title }}</a
              >
            }
          </div>

          @if (lesson(); as l) {
            <section class="panel block">
              <h2><ion-icon name="school-outline" aria-hidden="true" />Why it works</h2>
              <p class="why"><g-code-text [text]="l.why" /></p>
            </section>
          }

          <section class="panel block">
            <h2><ion-icon name="search-outline" aria-hidden="true" />Cues: how you spot it</h2>
            <ul>
              @for (c of p.cues; track c) {
                <li><g-code-text [text]="c" /></li>
              }
            </ul>
          </section>

          <section class="panel block code">
            <h2>Template</h2>
            <g-code-panel [code]="p.template" label="Template" />
          </section>

          @if (lesson(); as l) {
            <h2 class="section-title">Worked examples</h2>
            @for (e of l.examples; track e.title) {
              <section class="panel block">
                <app-worked-example [example]="e" />
              </section>
            }

            <section class="panel block">
              <h2><ion-icon name="git-branch-outline" aria-hidden="true" />Variations</h2>
              <dl class="variations">
                @for (v of l.variations; track v.name) {
                  <dt>{{ v.name }}</dt>
                  <dd>
                    <g-code-text [text]="v.how" />
                    @if (v.problemId && problemTitle(v.problemId); as title) {
                      <a class="try" [routerLink]="['/coding/problems', v.problemId]">Code: {{ title }} →</a>
                    }
                  </dd>
                }
              </dl>
            </section>
          }

          <section class="panel block">
            <h2><ion-icon name="alert-circle-outline" aria-hidden="true" />Pitfalls</h2>
            <ul>
              @for (c of p.pitfalls; track c) {
                <li><g-code-text [text]="c" /></li>
              }
            </ul>
          </section>

          @if (lesson(); as l) {
            <section class="panel block">
              <h2><ion-icon name="chatbubbles-outline" aria-hidden="true" />What interviewers ask next</h2>
              @for (f of l.followUps; track f.question) {
                <details class="follow-up">
                  <summary><g-code-text [text]="f.question" /></summary>
                  <p><g-code-text [text]="f.answer" /></p>
                </details>
              }
            </section>
          }

          <section class="panel block">
            <h2><ion-icon [icon]="icons.quickCheck" aria-hidden="true" />Quick check</h2>
            <app-quick-check [topic]="p.id" />
          </section>

          @if (m) {
            <p class="muted foot">
              {{ m.itemsSeen }}/{{ m.itemsTotal }} review items in rotation
              @if (m.predictionAccuracy !== null) {
                · {{ (m.predictionAccuracy * 100).toFixed(0) }}% prediction accuracy
              }
            </p>
          }
        </div>
      }
    </ion-content>
  `,
  styles: `
    @use '../../../type' as *;

    .head {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-top: 8px;
      > div {
        min-width: 0;
      }
    }
    h1 {
      font-size: clamp(1.625rem, 5vw, 2.25rem);
      margin: 4px 0 0;
    }
    /* Uppercase would change the notation: O(log n) is not O(LOG N). */
    .complexity {
      text-transform: none;
    }
    .one {
      font-size: 1.0625rem;
      line-height: 1.55;
      margin: 16px 0 18px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 20px;
      a {
        text-decoration: none;
      }
    }
    .block {
      padding: 16px;
      margin-bottom: 12px;
    }
    .block.code {
      padding: 16px 0 6px;
      h2 {
        padding: 0 16px;
      }
    }
    h2 {
      @include title;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1rem;
      margin: 0 0 10px;
      ion-icon {
        color: var(--g-accent);
      }
    }
    ul {
      margin: 0;
      padding-left: 18px;
    }
    li {
      line-height: 1.6;
      margin-bottom: 4px;
      font-size: 0.90625rem;
    }
    .why {
      margin: 0;
      line-height: 1.6;
      font-size: 0.9375rem;
    }
    .section-title {
      margin: 20px 0 10px;
    }
    .variations {
      margin: 0;
      display: grid;
      gap: 4px;
      dt {
        font-weight: 600;
        font-size: 0.90625rem;
        margin-top: 6px;
      }
      dd {
        margin: 0;
        line-height: 1.55;
        font-size: 0.90625rem;
      }
    }
    .follow-up {
      border-top: 1px solid var(--g-line);
      padding: 10px 0;
      &:first-of-type {
        border-top: 0;
        padding-top: 0;
      }
      summary {
        cursor: pointer;
        font-weight: 600;
        font-size: 0.90625rem;
        line-height: 1.5;
      }
      p {
        margin: 8px 0 0;
        line-height: 1.55;
        font-size: 0.90625rem;
      }
    }
    .foot {
      font-size: 0.8125rem;
    }
  `,
})
export class PatternPage {
  readonly id = input.required<string>();
  readonly progress = inject(ProgressService);
  readonly pattern = computed(() => getPattern(this.id()));
  readonly problems = computed(() => problemsForPattern(this.id()));
  readonly lesson = computed(() => getLesson(this.id()));
  readonly algorithms = computed(() => (this.pattern()?.algorithmIds ?? []).map((id) => getAlgorithmSummary(id)!).filter(Boolean));
  readonly itemCount = computed(() => itemsForTopic(this.id()).length);
  readonly patternCount = PATTERN_CATALOG.length;
  readonly icons = { drill: drillIcon, quickCheck: quickCheckIcon };
  readonly problemTitle = (id: string) => getProblemSummary(id)?.title;

  constructor() {
    addIcons({
      playCircle,
      searchOutline,
      alertCircleOutline,
      codeSlashOutline,
      schoolOutline,
      gitBranchOutline,
      chatbubblesOutline,
    });
  }
}
