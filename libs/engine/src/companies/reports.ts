import { addCalendarDays } from '../plan/options.js';
import { COMPANY_IDS, type CompanyId } from './companies.js';
import { INTERVIEW_REPORTS } from './reports.data.js';
import type { PublisherId } from './source-policy.js';

export type ReportedItemKind = 'problem' | 'case';

export type ReportDateBasis = 'interview' | 'published' | 'updated';

/** A public write-up that names one of our problems or cases as asked at a company. */
export interface InterviewReport {
  kind: ReportedItemKind;
  itemId: string;
  company: CompanyId;
  source: { url: string; title: string; publisher: PublisherId };
  /**
   * `YYYY`, `YYYY-MM` or `YYYY-MM-DD`: the interview date when the write-up gives one, otherwise its publication date,
   * or its last-updated date when the page shows only that; either then stands in for it, expiry included.
   */
  reported: { date: string; basis: ReportDateBasis };
  /** The day someone last opened the source and found it still supports the report. */
  checked: string;
  /** What was asked, in our own words; never the problem's or the post's text. */
  note: string;
}

export const REPORT_MAX_AGE_MONTHS = 24;
export const RECHECK_DAYS = 100;

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, '0');

/** The last day a partial date covers: `2025` is 2025-12-31 and `2025-02` is 2025-02-28. */
export function lastDayOf(date: string): string {
  const [year, month = 12, day] = date.split('-').map(Number);
  return `${year}-${pad(month)}-${pad(day ?? daysIn(year, month))}`;
}

/** The same day `months` later, or that month's last day when it is shorter. */
export function addMonths(day: string, months: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const index = year * 12 + month - 1 + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${pad(m)}-${pad(Math.min(date, daysIn(y, m)))}`;
}

/** The last day a report is shown for its age: 24 months after the last day its date covers. */
export const shownUntil = (report: InterviewReport) => addMonths(lastDayOf(report.reported.date), REPORT_MAX_AGE_MONTHS);

/** The last day a report is shown without a fresh check. */
export const recheckBy = (report: InterviewReport) => addCalendarDays(report.checked, RECHECK_DAYS);

/** Decided with the device's day, so a report expires, or hides for want of a recheck, without a release. */
export const reportVisible = (report: InterviewReport, today: string) => today <= shownUntil(report) && today <= recheckBy(report);

/** The reports a problem or case page lists today: by company in `COMPANY_NAMES` order, newest first within one. */
export function visibleReports(
  kind: ReportedItemKind,
  itemId: string,
  today: string,
  reports: readonly InterviewReport[] = INTERVIEW_REPORTS,
): InterviewReport[] {
  return reports
    .filter((r) => r.kind === kind && r.itemId === itemId && reportVisible(r, today))
    .sort(
      (a, b) =>
        COMPANY_IDS.indexOf(a.company) - COMPANY_IDS.indexOf(b.company) ||
        lastDayOf(b.reported.date).localeCompare(lastDayOf(a.reported.date)),
    );
}
