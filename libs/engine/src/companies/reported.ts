import type { OfferedCompany } from '../plan/options.js';
import type { CompanyId } from './companies.js';

/** The problems and cases a company's visible interview reports name, on one day. Built from data the caller loads. */
export interface ReportedItems {
  company: CompanyId;
  problems: ReadonlySet<string>;
  cases: ReadonlySet<string>;
}

export type ReportedSets = Partial<Record<OfferedCompany, ReadonlySet<string>>>;

/** The "Reported at" facet's test: an item matches when any chosen company's reports name it. */
export const reportedByAny = (chosen: readonly OfferedCompany[], sets: ReportedSets, itemId: string) =>
  chosen.some((company) => sets[company]?.has(itemId));
