import { ChangeDetectionStrategy, Component, LOCALE_ID, computed, inject, input } from '@angular/core';
import {
  COMPANY_NAMES,
  PUBLISHERS,
  visibleReports,
  type InterviewReport,
  type ReportDateBasis,
  type ReportedItemKind,
} from '@grasp/engine';
import { ProgressService } from '../core/progress.service';
import { dayLabel } from '../pages/today/today.service';
import { DisclosureComponent } from '../ui/disclosure.component';

const MONTH_YEAR: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' };
const BASIS_LABELS: Record<ReportDateBasis, string> = { interview: 'Interview', published: 'Published', updated: 'Updated' };

/** "Reported in interviews": public write-ups that name this problem or case, while they are fresh (R49). */
@Component({
  selector: 'app-interview-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DisclosureComponent],
  // Hidden rather than empty, so a page's spacing and rules around the list go with it.
  host: { '[attr.hidden]': 'reports().length ? null : ""' },
  template: `
    @if (reports().length) {
      <g-disclosure [summary]="summary()">
        <ul>
          @for (r of reports(); track r.source.url) {
            <li>
              <p class="line">
                <strong>{{ companies[r.company] }}</strong
                >&ngsp;<span class="date">{{ dateLabel(r) }}</span>
              </p>
              <p class="note">{{ r.note }}</p>
              @let publisher = publishers[r.source.publisher].name;
              <a
                class="source"
                [href]="r.source.url"
                target="_blank"
                rel="noopener noreferrer"
                [attr.aria-label]="publisher + ': ' + r.source.title + ' (opens in a new tab)'"
                >{{ publisher }}<span aria-hidden="true"> ↗</span></a
              >
            </li>
          }
        </ul>
        <p class="footer">
          From public write-ups by candidates, dated by the interview when the write-up says, otherwise by when the page was published or
          last updated. Grasp is not affiliated with these companies or publishers, and a report says nothing about how often a question is
          asked.
        </p>
      </g-disclosure>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    :host([hidden]) {
      display: none;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--g-space-3);
    }
    p {
      margin: 0;
      line-height: 1.5;
    }
    .date,
    .note,
    .footer {
      color: var(--g-muted);
    }
    .note,
    .footer {
      font-size: var(--g-text-body-s);
    }
    .source {
      display: inline-block;
      padding-block: var(--g-space-1);
    }
    .footer {
      margin-top: var(--g-space-3);
    }
  `,
})
export class InterviewReportsComponent {
  readonly kind = input.required<ReportedItemKind>();
  readonly itemId = input.required<string>();
  readonly companies = COMPANY_NAMES;
  readonly publishers = PUBLISHERS;
  private readonly progress = inject(ProgressService);
  private readonly locale = inject(LOCALE_ID);

  readonly reports = computed(() => visibleReports(this.kind(), this.itemId(), this.progress.day()));
  readonly summary = computed(
    () => `Reported in interviews: ${[...new Set(this.reports().map((r) => COMPANY_NAMES[r.company]))].join(', ')}`,
  );

  dateLabel({ reported: { date, basis } }: InterviewReport): string {
    const when = date.length === 4 ? date : dayLabel(`${date.slice(0, 7)}-01`, MONTH_YEAR, this.locale);
    return `${BASIS_LABELS[basis]} ${when}`;
  }
}
