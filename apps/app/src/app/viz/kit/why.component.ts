import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { valueHistory, type Frame } from '@grasp/engine';

/**
 * A value's history (REDESIGN.md 3.3): each value a variable took, at the step and line that set it, with a button to
 * seek there.
 */
@Component({
  selector: 'g-why',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="history" [attr.aria-label]="'History of ' + name()">
      @for (entry of history(); track entry.step) {
        <li>
          <button class="g-btn ghost" [attr.aria-current]="entry.step === at() ? 'step' : null" (click)="seek.emit(entry.step)">
            <span class="mono value">{{ entry.value ?? '–' }}</span
            >&ngsp;<span class="where">at step {{ entry.step + 1 }}, line {{ entry.line }}</span>
          </button>
        </li>
      }
    </ol>
  `,
  styles: `
    :host {
      display: block;
    }
    .history {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: var(--g-space-1);
    }
    .g-btn {
      min-height: 32px;
      padding: var(--g-space-1) var(--g-space-2);
      gap: var(--g-space-2);
      font-size: var(--g-text-body-s);
      font-weight: 500;
    }
    .g-btn[aria-current] {
      border-color: var(--g-state-current);
    }
    .value {
      font-weight: 600;
      color: var(--g-text);
    }
    .where {
      color: var(--g-muted);
    }
  `,
})
export class WhyComponent {
  readonly name = input.required<string>();
  readonly frames = input.required<readonly Frame[]>();
  /** The frame on show, whose entry is marked as current. */
  readonly index = input.required<number>();
  readonly seek = output<number>();

  /** The past only: a later value could answer a checkpoint still ahead, and seeking there would skip it. */
  readonly history = computed(() => valueHistory(this.frames(), this.name(), this.index()));
  /** The entry in force at the frame on show: the last one set at or before it. */
  readonly at = computed(
    () =>
      this.history()
        .filter((entry) => entry.step <= this.index())
        .at(-1)?.step ?? null,
  );
}
