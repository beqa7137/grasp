import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { fmt, kpiVerdicts } from '@grasp/engine';
import { uniqueId } from '../../core/unique-id';
import type { LabHost } from './lab-host';

type Panel = 'workload' | 'model';

const pct = (share: number) => `${Number((share * 100).toFixed(1))}%`;

/**
 * The Lab's run dock on desktop (REDESIGN.md 4.6): p99, errors, served and cost against the goals, the Workload popover
 * with only the controls the build declares, the Model chip, and Trace a request. Each popover is a disclosure that keeps
 * the keys it is given: Escape inside it closes it and returns focus to its button.
 */
@Component({
  selector: 'app-lab-dock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:pointerdown)': 'outside($event)' },
  templateUrl: './lab-dock.component.html',
  styleUrl: './lab-dock.component.scss',
})
export class LabDockComponent {
  readonly host = input.required<LabHost>();
  readonly metrics = computed(() => this.host().result().metrics);
  readonly goals = computed(() => this.host().dockGoals());
  readonly controls = computed(() => this.host().controls());
  readonly workload = computed(() => this.host().workload());

  readonly open = signal<Panel | null>(null);
  readonly ids = { workload: uniqueId('lab-workload'), model: uniqueId('lab-model') };
  private readonly workloadButton = viewChild<ElementRef<HTMLButtonElement>>('workloadButton');
  private readonly modelButton = viewChild<ElementRef<HTMLButtonElement>>('modelButton');
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly fmt = fmt;
  readonly pct = pct;

  readonly verdicts = computed(() => {
    const g = this.goals();
    return g.kind === 'none' ? null : kpiVerdicts(this.metrics(), g.goals);
  });
  readonly limits = computed(() => {
    const g = this.goals();
    if (g.kind === 'none') return null;
    const { maxP99Ms, maxErrorRate, maxMonthlyCost } = g.goals;
    return {
      p99: `≤ ${fmt(maxP99Ms)} ms`,
      errors: `≤ ${pct(maxErrorRate)}`,
      cost: maxMonthlyCost === Number.POSITIVE_INFINITY ? 'no budget' : `≤ $${fmt(maxMonthlyCost)}`,
    };
  });
  readonly hasWorkload = computed(() => {
    const c = this.controls();
    return !!c && !!(c.reads || c.bots || c.files);
  });
  readonly p99 = computed(() => (this.metrics().errorRate >= 1 ? '–' : Math.round(this.metrics().p99Ms).toLocaleString('en-US')));
  readonly errors = computed(() => `${Number((this.metrics().errorRate * 100).toFixed(2))}%`);

  toggle(panel: Panel) {
    this.open.update((p) => (p === panel ? null : panel));
  }

  /** Escape from anywhere inside an open popover closes it, and focus goes back to the button that opened it. */
  closeOnEscape(event: KeyboardEvent, panel: Panel) {
    if (event.key !== 'Escape' || this.open() !== panel) return;
    event.preventDefault();
    event.stopPropagation();
    this.open.set(null);
    (panel === 'workload' ? this.workloadButton() : this.modelButton())?.nativeElement.focus();
  }

  /** A popover closes when focus leaves it and its button. */
  closeOnFocusOut(event: FocusEvent, pop: HTMLElement) {
    if (!pop.contains(event.relatedTarget as Node | null)) this.open.set(null);
  }

  /** A press anywhere outside the open popover and its button closes it. */
  outside(event: PointerEvent) {
    if (this.open() && !this.element.nativeElement.querySelector('.pop.open')?.contains(event.target as Node)) this.open.set(null);
  }

  verdictWord(v: string | undefined) {
    return v === 'pass' ? 'met' : v === 'fail' ? 'missed' : '';
  }
}
