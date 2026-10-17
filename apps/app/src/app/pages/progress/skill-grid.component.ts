import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { GridSkill, SkillState } from '@grasp/engine';

export const STATE_NAMES: Record<SkillState, string> = { new: 'New', learning: 'Learning', practiced: 'Practiced', ready: 'Ready' };

/**
 * One row of skill squares (REDESIGN.md 4.10): a square per skill, filled by its state with the shapes `g-skill-state`
 * uses (empty, half, full, full with a check), dashed when the skill is Stretch at the Target's level. On a phone the
 * squares wrap at 12 a row.
 */
@Component({
  selector: 'app-skill-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="grid" [attr.aria-label]="label()">
      @for (s of cells(); track s.id) {
        <li class="sq" [class]="s.state" [class.stretch]="!s.required" [title]="s.text">
          <span class="visually-hidden">{{ s.text }}</span>
        </li>
      }
    </ul>
  `,
  styles: `
    @use '../../../breakpoints' as *;

    :host {
      display: block;
      container-type: inline-size;
    }
    .grid {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, 1.5rem);
      gap: var(--g-space-1);
      @include container-narrow {
        grid-template-columns: repeat(12, minmax(0, 1.5rem));
      }
    }
    .sq {
      position: relative;
      aspect-ratio: 1;
      border: 1.5px solid var(--g-stroke);
      border-radius: var(--g-radius-xs);
      overflow: hidden;
    }
    .stretch {
      border-style: dashed;
    }
    .learning,
    .practiced {
      border-color: var(--g-info-ink);
    }
    .learning {
      background: linear-gradient(to top, var(--g-info-ink) 50%, transparent 50%);
    }
    .practiced {
      background: var(--g-info-ink);
    }
    .ready {
      border-color: var(--g-success-ink);
      background: var(--g-success-ink);
      &::after {
        content: '';
        position: absolute;
        inset: 22% 30% 34%;
        border: solid var(--g-on-fill);
        border-width: 0 2px 2px 0;
        transform: rotate(45deg);
      }
    }
    @media (forced-colors: active) {
      .learning {
        background: linear-gradient(to top, CanvasText 50%, transparent 50%);
      }
      .practiced,
      .ready {
        background: CanvasText;
      }
    }
  `,
})
export class SkillGridComponent {
  readonly skills = input.required<readonly GridSkill[]>();
  readonly label = input.required<string>();
  readonly cells = computed(() =>
    this.skills().map((s) => ({
      ...s,
      text: `${s.name}: ${STATE_NAMES[s.state]}${s.flagged ? ', flagged' : ''}${s.required ? '' : ', Stretch'}`,
    })),
  );
}
