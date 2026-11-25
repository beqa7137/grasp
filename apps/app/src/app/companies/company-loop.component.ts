import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { COMPANY_LOOPS, COMPANY_NAMES, type Seniority, type TargetCompany } from '@grasp/engine';
import { DisclosureComponent } from '../ui/disclosure.component';

/**
 * The target company's title for the level, and how its loops usually run, closed by default (REDESIGN.md R51). `folded`
 * moves the title inside too, so "Your loop" stays short.
 */
@Component({
  selector: 'app-company-loop',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DisclosureComponent],
  host: { '[attr.hidden]': 'loop() ? null : ""' },
  template: `
    @if (loop(); as l) {
      @if (!folded()) {
        <p class="title">{{ l.levels[level()] }}</p>
      }
      <g-disclosure [summary]="'How ' + name() + ' loops usually run'">
        @if (folded()) {
          <p class="line">{{ l.levels[level()] }}</p>
        }
        @for (line of l.lines; track line) {
          <p class="line">{{ line }}</p>
        }
      </g-disclosure>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .title,
    .line {
      margin: 0;
      font-size: var(--g-text-body);
      line-height: 1.45;
    }
    .line {
      color: var(--g-muted);
      max-width: 62ch;
      & + .line {
        margin-top: var(--g-space-2);
      }
    }
  `,
})
export class CompanyLoopComponent {
  readonly company = input.required<TargetCompany>();
  readonly level = input.required<Seniority>();
  readonly folded = input(false);
  readonly loop = computed(() => COMPANY_LOOPS[this.company()] ?? null);
  readonly name = computed(() => COMPANY_NAMES[this.company()]);
}
