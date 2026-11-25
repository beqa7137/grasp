import { SENIORITY_LEVELS, type Seniority } from '../behavioral/types.js';
import type { OfferedCompany, TargetCompany } from '../plan/options.js';
import { COMPANY_NAMES } from './companies.js';

export interface CompanyLoop {
  /** How the company's loop usually runs, from its own hiring pages and candidates' write-ups. */
  lines: readonly string[];
  /** The company's title for each level, as one sentence. */
  levels: Record<Seniority, string>;
}

export const COMPANY_LOOPS: Partial<Record<TargetCompany, CompanyLoop>> = {
  microsoft: {
    lines: [
      'Loops vary by team. Microsoft says most have two to four conversations of up to an hour, sometimes after a short screening call.',
      'Engineering write-ups often describe one or two technical screens (for new graduates, often an online assessment), then four rounds of 45 to 60 minutes. Most rounds include coding, and system design usually joins from SDE II up.',
      'Behavioral questions are often woven into the rounds, usually at the start. The last round is often with a senior leader, such as a principal engineer or an engineering manager; some write-ups call it the "as appropriate" (AA) round.',
    ],
    levels: {
      early: 'Early career at Microsoft is usually Software Engineer (SDE), levels 59 to 60.',
      mid: 'Mid-level at Microsoft is usually Software Engineer II (SDE II), levels 61 to 62.',
      senior: 'Senior at Microsoft is usually Senior Software Engineer, levels 63 to 64.',
    },
  },
};

/** "Mid-level loop", or "Mid-level Microsoft loop" at an offered company. Today's line spells it again for first paint. */
export const targetLoopName = (level: Seniority, company: OfferedCompany | null) =>
  `${SENIORITY_LEVELS.find((l) => l.level === level)!.label}${company ? ` ${COMPANY_NAMES[company]}` : ''} loop`;
