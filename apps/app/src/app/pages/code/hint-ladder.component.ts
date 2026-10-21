import { ChangeDetectionStrategy, Component, ElementRef, Injector, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getAlgorithmSummary, getPattern, getPatternSummary, matchingCues, type CodingProblem } from '@grasp/engine';
import { refocusAfterRender } from '../../core/focus';
import { HINT_RUNGS } from '../../core/local-drafts';
import { CodePanelComponent } from '../../viz/code-panel.component';
import { CodeTextComponent } from '../../viz/code-text.component';

/**
 * The workspace's hint ladder (REDESIGN.md 4.2), built from content the app already has, so it works offline: each tap
 * opens one more rung. The workspace keeps how far the learner went, on the device only; a pattern already shown (solved,
 * opened from its hub) counts as the first rung.
 */
@Component({
  selector: 'app-hint-ladder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CodePanelComponent, CodeTextComponent],
  template: `
    @if (pattern(); as p) {
      <h2 class="eyebrow">Hints</h2>
      <ol class="rungs">
        <li tabindex="-1">
          @if (shown() >= 1) {
            <p>
              The pattern: <a [routerLink]="['/coding/patterns', p.id]">{{ p.name }}</a
              >{{ others() ? ' (also ' + others() + ')' : '' }}.
            </p>
          } @else {
            <button class="g-btn" (click)="open(1)">Which pattern?</button>
          }
        </li>
        @if (shown() >= 1) {
          <li tabindex="-1">
            @if (shown() >= 2) {
              @if (cues().cues.length) {
                <p>{{ quoted() }} in the statement {{ cues().words.length === 1 ? 'is a cue' : 'are cues' }} for {{ p.name }}:</p>
                <ul>
                  @for (c of cues().cues; track c) {
                    <li><g-code-text [text]="c" /></li>
                  }
                </ul>
              } @else {
                <p>No word in the statement names a cue outright. {{ p.name }}'s cues:</p>
                <ul>
                  @for (c of p.cues; track c) {
                    <li><g-code-text [text]="c" /></li>
                  }
                </ul>
              }
            } @else {
              <button class="g-btn" (click)="open(2)">Which words give it away?</button>
            }
          </li>
        }
        @if (shown() >= 2) {
          <li tabindex="-1">
            @if (shown() >= 3) {
              <g-code-panel [code]="p.template" [label]="p.name + ' template'" />
            } @else {
              <button class="g-btn" (click)="open(3)">Show the template</button>
            }
          </li>
        }
        @if (shown() >= 3 && visualizer(); as v) {
          <li>
            <a class="g-btn" [routerLink]="['/coding/visualizers', v.id]" (click)="open(4)">Watch it: {{ v.title }} →</a>
          </li>
        }
      </ol>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    h2 {
      margin: 0 0 var(--g-space-2);
    }
    .rungs {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--g-space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    p {
      margin: 0 0 var(--g-space-2);
    }
    ul {
      margin: 0;
      padding-left: var(--g-space-5);
    }
    a.g-btn {
      text-decoration: none;
    }
  `,
})
export class HintLadderComponent {
  readonly problem = input.required<CodingProblem>();
  /** The pattern the hints are about: the hub's the workspace was opened from, else the problem's first. */
  readonly patternId = input.required<string>();
  /** How many rungs are open. */
  readonly shown = input.required<number>();
  /** Opens a rung: the workspace keeps the count (the ladder loads apart from it, through an outlet that binds no outputs). */
  readonly reveal = input.required<(rung: number) => void>();

  readonly pattern = computed(() => getPattern(this.patternId()));
  readonly others = computed(() =>
    this.problem()
      .patternIds.filter((id) => id !== this.patternId())
      .map((id) => getPattern(id)?.name ?? id)
      .join(', '),
  );
  readonly cues = computed(() => matchingCues(this.pattern()?.cues ?? [], this.problem().statement.join(' ')));
  readonly quoted = computed(() => {
    const words = this.cues().words.map((w) => `“${w}”`);
    return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : (words[0] ?? '');
  });
  readonly visualizer = computed(() => {
    const id = getPatternSummary(this.patternId())?.algorithmIds[0];
    return id ? getAlgorithmSummary(id) : undefined;
  });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** Opens a rung; its button goes, so focus moves to what it opened, which a screen reader then reads. */
  open(rung: number) {
    this.reveal()(rung);
    if (rung < HINT_RUNGS)
      refocusAfterRender(
        this.injector,
        () => this.host.nativeElement.querySelectorAll<HTMLElement>('.rungs > li')[rung - 1],
        this.host.nativeElement,
      );
  }
}
