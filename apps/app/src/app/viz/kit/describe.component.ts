import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { describeEvents, describeFrame, describedNote, type Frame, type VizEvent } from '@grasp/engine';
import { uniqueId } from '../../core/unique-id';
import { CodeTextComponent } from '../code-text.component';

/**
 * Describe (REDESIGN.md 3.3): the frame on show as text, for anyone who cannot see the stage or wants its numbers. The
 * note in full, what the step changed, then a data table per view.
 */
@Component({
  selector: 'g-describe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CodeTextComponent],
  host: { role: 'region', '[attr.aria-labelledby]': 'titleId', '(keydown.escape)': 'close()()' },
  template: `
    <div class="head">
      <h2 class="eyebrow" tabindex="-1" [id]="titleId">Describe · step {{ index() + 1 }}</h2>
      <button class="g-btn ghost close" (click)="close()()">Close</button>
    </div>
    <p class="note"><g-code-text [text]="note()" /></p>
    @if (changes().length) {
      <h3>What changed</h3>
      <ul class="changes">
        @for (change of changes(); track $index) {
          <li>{{ change }}</li>
        }
      </ul>
    } @else if (stepped()) {
      <p class="still">No visible change.</p>
    }
    @for (table of tables(); track table.title) {
      <div class="scroller" tabindex="0" role="region" [attr.aria-label]="table.title">
        <table>
          <caption>
            {{
              table.title
            }}
          </caption>
          <thead>
            <tr>
              @for (column of table.columns; track $index) {
                <th scope="col">{{ column }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of table.rows; track $index) {
              <tr>
                <th scope="row" class="mono">{{ row[0] }}</th>
                @for (cell of row.slice(1); track $index) {
                  <td class="mono">{{ cell }}</td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: `
    @use '../../../type' as *;

    :host {
      display: block;
      margin-bottom: var(--g-space-3);
      padding: var(--g-space-3);
      border: 1px solid var(--g-line);
      border-radius: var(--g-radius-md);
      background: var(--g-surface);
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--g-space-2);
    }
    h2 {
      margin: 0;
    }
    h3 {
      margin: var(--g-space-3) 0 var(--g-space-1);
      @include label;
      color: var(--g-muted);
    }
    .close {
      font-size: var(--g-text-body-s);
    }
    .note,
    .still {
      margin: var(--g-space-2) 0 0;
      font-size: var(--g-text-body);
      line-height: 1.5;
    }
    .changes {
      margin: 0;
      padding-left: var(--g-space-5);
      font-size: var(--g-text-body-s);
      line-height: 1.5;
    }
    .scroller {
      margin-top: var(--g-space-3);
      overflow-x: auto;
    }
    table {
      border-collapse: collapse;
      font-size: var(--g-text-body-s);
      font-variant-numeric: tabular-nums;
    }
    caption {
      text-align: left;
      @include label;
      color: var(--g-muted);
      padding-bottom: var(--g-space-1);
    }
    th,
    td {
      text-align: left;
      padding: var(--g-space-1) var(--g-space-2);
      border-top: 1px solid var(--g-line);
      white-space: nowrap;
    }
    thead th {
      border-top: 0;
      font-weight: 600;
      color: var(--g-muted);
    }
    tbody th {
      font-weight: 600;
    }
  `,
})
export class DescribeComponent {
  readonly frame = input.required<Frame>();
  /** The frame's index in its run. */
  readonly index = input.required<number>();
  /** The changes into the frame; null after a jump, when there is no single step to describe. */
  readonly events = input<readonly VizEvent[] | null>(null);
  /** The frame asks and is not answered yet, so the note, which can hold the answer, gives way to the caption. */
  readonly asking = input(false);
  /** Closes the panel; an input rather than an output, as the player renders this lazily through `NgComponentOutlet`. */
  readonly close = input.required<() => void>();
  protected readonly titleId = uniqueId('g-describe');

  readonly note = computed(() => describedNote(this.frame(), this.asking()));
  readonly stepped = computed(() => this.events() !== null);
  readonly changes = computed(() => describeEvents(this.events() ?? [], this.frame()));
  readonly tables = computed(() => describeFrame(this.frame()));
}
