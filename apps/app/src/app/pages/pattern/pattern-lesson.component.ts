import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { getLesson, getPattern, getProblemSummary } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { alertCircleOutline, chatbubblesOutline, gitBranchOutline, schoolOutline, searchOutline } from 'ionicons/icons';
import { ArticleComponent } from '../../ui/article.component';
import { quickCheckIcon } from '../../ui/icons';
import { CodePanelComponent } from '../../viz/code-panel.component';
import { CodeTextComponent } from '../../viz/code-text.component';
import { QuickCheckComponent } from './quick-check.component';
import { WorkedExampleComponent } from './worked-example.component';

/** A pattern hub's Lesson segment (REDESIGN.md 4.3): the cue, the template, worked examples, pitfalls and a quick check. */
@Component({
  selector: 'app-pattern-lesson',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IonIcon, ArticleComponent, CodePanelComponent, CodeTextComponent, QuickCheckComponent, WorkedExampleComponent],
  template: `
    @if (pattern; as p) {
      <g-article class="page narrow">
        <p class="one"><g-code-text [text]="p.oneLiner" /></p>
        <p class="complexity muted">{{ p.complexity }}</p>

        @if (lesson; as l) {
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

        @if (lesson; as l) {
          <h2 class="section-title">Worked examples</h2>
          @for (e of l.examples; track e.title) {
            <section class="panel block">
              <app-worked-example [example]="e" />
            </section>
          }

          <section class="panel block">
            <h2><ion-icon name="git-branch-outline" aria-hidden="true" />Variations</h2>
            <dl>
              @for (v of l.variations; track v.name) {
                <dt>{{ v.name }}</dt>
                <dd>
                  <g-code-text [text]="v.how" />
                  @if (v.problemId && problemTitle(v.problemId); as title) {
                    <a class="try" [routerLink]="['/coding/problems', v.problemId]" [state]="{ pattern: p.id, fromHub: true }"
                      >Code: {{ title }} →</a
                    >
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

        @if (lesson; as l) {
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

        <section class="check">
          <h2><ion-icon [icon]="icons.quickCheck" aria-hidden="true" />Quick check</h2>
          <app-quick-check [topic]="p.id" [inHub]="true" />
        </section>
      </g-article>
    }
  `,
  styles: `
    @use '../../../type' as *;

    .one {
      font-size: var(--g-text-title-m);
      line-height: 1.55;
      margin: 0 0 var(--g-space-1);
    }
    .complexity {
      margin: 0 0 var(--g-space-4);
      font-family: var(--g-font-mono);
      font-size: var(--g-text-body-s);
    }
    .block {
      padding: var(--g-space-4);
      margin-bottom: var(--g-space-3);
    }
    .block.code {
      padding: var(--g-space-4) 0 var(--g-space-2);
      h2 {
        padding: 0 var(--g-space-4);
      }
    }
    h2 {
      @include title;
      display: flex;
      align-items: center;
      gap: var(--g-space-2);
      font-size: var(--g-text-body-l);
      margin: 0 0 var(--g-space-3);
      ion-icon {
        color: var(--g-accent);
      }
    }
    .panel ul,
    .panel p:last-child {
      margin-bottom: 0;
    }
    .section-title {
      margin: var(--g-space-5) 0 var(--g-space-3);
    }
    .try {
      display: inline-block;
      margin-top: var(--g-space-1);
    }
    .check {
      margin-top: var(--g-space-5);
    }
  `,
})
export class PatternLessonComponent {
  // A hub shows one pattern, so its segments read the hub's id once.
  private readonly id = inject(ActivatedRoute).parent?.snapshot.paramMap.get('id') ?? '';
  readonly pattern = getPattern(this.id);
  readonly lesson = getLesson(this.id);
  readonly icons = { quickCheck: quickCheckIcon };
  readonly problemTitle = (id: string) => getProblemSummary(id)?.title;

  constructor() {
    addIcons({ searchOutline, alertCircleOutline, schoolOutline, gitBranchOutline, chatbubblesOutline });
  }
}
