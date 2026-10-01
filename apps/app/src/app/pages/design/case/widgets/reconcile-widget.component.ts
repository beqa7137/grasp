import { ChangeDetectionStrategy, Component, ElementRef, Injector, computed, inject, signal, viewChild } from '@angular/core';
import {
  RECON_ACTIONS,
  contractFee,
  explainRow,
  formatMinor,
  reconTotals,
  reconcile,
  reconciliationDay,
  type ReconRow,
  type WidgetCheckpoint,
} from '@grasp/engine';
import { refocusAfterRender } from '../../../../core/focus';
import { WidgetCheckComponent } from './widget-check.component';

const usd = (cents: number) => formatMinor(cents, 'USD');

/** A day's captures against the processor's settlement report: say what to do with each order, then see the books agree. */
@Component({
  selector: 'app-reconcile-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WidgetCheckComponent],
  template: `
    <p class="intro" tabindex="-1" #intro>
      Day {{ seed() }}. The report covers captures up to {{ day().cutoff }}, and the contract fee is a typical card rate, 2.9% plus 30
      cents. Rows are matched by our order reference.
    </p>
    <ol class="rows">
      @for (row of rows(); track row.order; let i = $index) {
        <li class="row">
          <h4 class="mono">{{ row.order }}</h4>
          <div class="sides">
            <div>
              <p class="side">Our ledger</p>
              @if (row.ledger; as l) {
                <p>
                  @if (l.status === 'captured') {
                    Captured <strong class="mono">{{ usd(l.amount) }}</strong> at {{ l.time }} as <span class="mono">{{ l.charge }}</span>
                  } @else {
                    Attempt of <strong class="mono">{{ usd(l.amount) }}</strong> at {{ l.time }} timed out: outcome unknown
                  }
                </p>
                <p class="muted">Expected fee {{ usd(fee(l.amount)) }}</p>
              } @else {
                <p class="muted">Nothing recorded</p>
              }
            </div>
            <div>
              <p class="side">Processor report</p>
              @for (line of row.report; track line.charge) {
                <p>
                  <span class="mono">{{ line.charge }}</span
                  >: <strong class="mono">{{ usd(line.gross) }}</strong
                  >, fee
                  {{ usd(line.fee) }}
                </p>
              } @empty {
                <p class="muted">No line</p>
              }
            </div>
          </div>
          <app-widget-check [check]="checks()[i]" [chosen]="answers()[i] ?? null" (chosenChange)="answer(i, $event)" />
        </li>
      }
    </ol>

    <div class="summary" role="status">
      @if (score() !== null) {
        <p>
          <strong>{{ score() }} of {{ rows().length }} right.</strong> The ledger captured {{ usd(totals().ledgerCaptured) }} and the report
          shows {{ usd(totals().reportGross) }}: {{ gap() }}.
          @if (totals().feeDifference) {
            The processor also took {{ usd(totals().feeDifference) }} more in fees than the contract.
          }
        </p>
      }
    </div>
    <button class="g-btn" (click)="nextDay()">Another day</button>
  `,
  styleUrl: '../../../design-lesson/widget.scss',
  styles: `
    .intro {
      margin: 0 0 12px;
      font-size: 0.875rem;
      line-height: 1.5;
      outline: none;
    }
    .rows {
      list-style: none;
      margin: 0 0 12px;
      padding: 0;
      display: grid;
      gap: 12px;
    }
    .row {
      padding: 12px;
      border-radius: var(--g-radius-sm);
      background: var(--g-raised);
    }
    h4 {
      margin: 0 0 8px;
      font-size: 0.9375rem;
    }
    .sides {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 4px 16px;
      margin-bottom: 12px;
      font-size: 0.875rem;
      line-height: 1.45;
      p {
        margin: 0 0 4px;
        overflow-wrap: anywhere;
      }
    }
    .side {
      font-size: 0.75rem;
      color: var(--g-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .summary p {
      margin: 0 0 12px;
      line-height: 1.55;
    }
  `,
})
export class ReconcileWidgetComponent {
  readonly usd = usd;
  readonly fee = contractFee;
  readonly seed = signal(1);
  readonly day = computed(() => reconciliationDay(this.seed()));
  readonly rows = computed(() => reconcile(this.day()));
  readonly totals = computed(() => reconTotals(this.day()));
  readonly checks = computed(() => this.rows().map((row) => this.checkFor(row)));
  readonly gap = computed(() => {
    const { reportGross, ledgerCaptured } = this.totals();
    const gap = reportGross - ledgerCaptured;
    if (!gap) return 'the totals agree, and each break above still needs its own fix';
    return `the report shows ${usd(Math.abs(gap))} ${gap > 0 ? 'more' : 'less'} than the ledger, which the breaks above explain row by row`;
  });
  readonly answers = signal<(number | null)[]>([]);
  readonly score = computed(() => {
    const answers = this.answers();
    const checks = this.checks();
    if (checks.some((_, i) => answers[i] === undefined || answers[i] === null)) return null;
    return checks.filter((c, i) => answers[i] === c.answer).length;
  });
  private readonly injector = inject(Injector);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly intro = viewChild.required<ElementRef<HTMLElement>>('intro');

  answer(index: number, chosen: number | null) {
    this.answers.update((a) => Object.assign([...a], { [index]: chosen }));
  }

  nextDay() {
    this.seed.update((s) => s + 1);
    this.answers.set([]);
    refocusAfterRender(this.injector, () => this.intro().nativeElement, this.host);
  }

  private checkFor(row: ReconRow): WidgetCheckpoint {
    return {
      prompt: `What do you do with ${row.order}?`,
      choices: RECON_ACTIONS.map((a) => a.label),
      answer: RECON_ACTIONS.findIndex((a) => a.kind === row.kind),
      explain: explainRow(row, this.day().cutoff),
    };
  }
}
