import type { TargetCompany } from '../plan/options.js';

/** A competency or a single question that practices a culture attribute, and why. */
export interface CulturePractice {
  id: string;
  reason: string;
}

export interface CultureAttribute {
  id: string;
  name: string;
  competencies: readonly CulturePractice[];
  /** Questions outside the mapped competencies that practice it too. */
  questions: readonly CulturePractice[];
  /** The scripted interviewer's follow-up for a question that practices it. */
  probe: string;
}

/** What a company says it looks for, mapped to the behavioral content that practices it (REDESIGN.md R51). */
export const COMPANY_CULTURES: Partial<Record<TargetCompany, readonly CultureAttribute[]>> = {
  microsoft: [
    {
      id: 'growth-mindset',
      name: 'Growth mindset',
      competencies: [
        { id: 'learning', reason: 'Getting useful fast in something new shows curiosity over already knowing.' },
        { id: 'failure', reason: 'A real mistake, owned, and what you changed afterward.' },
      ],
      questions: [
        { id: 'feedback-3', reason: 'Asking for feedback, then changing because of it.' },
        { id: 'feedback-7', reason: 'Hearing out feedback you disagreed with instead of defending yourself.' },
        { id: 'conflict-6', reason: 'Admitting the other side was right, and what you took from it.' },
        { id: 'influence-6', reason: 'Changing your own position after listening.' },
      ],
      probe: 'Looking back, what did that experience change about how you work now?',
    },
    {
      id: 'customer-obsessed',
      name: 'Customer obsessed',
      competencies: [{ id: 'customer', reason: 'Learning what users actually need before building, and checking they got it.' }],
      questions: [],
      probe: 'How did you find out what the people using it actually needed?',
    },
    {
      id: 'diverse-inclusive',
      name: 'Diverse and inclusive',
      competencies: [],
      questions: [
        { id: 'collaboration-4', reason: "Making sure a teammate's contribution is seen and credited." },
        { id: 'leadership-6', reason: 'Bringing a new teammate in so they can contribute quickly.' },
      ],
      probe: 'Whose view was easiest to miss there, and how did you make sure it was heard?',
    },
    {
      id: 'one-microsoft',
      name: 'One Microsoft',
      competencies: [
        { id: 'collaboration', reason: 'Making shared work succeed when no one person controls it, inside your team or across teams.' },
        { id: 'influence', reason: 'Moving other teams by persuasion rather than authority.' },
      ],
      questions: [{ id: 'delivery-4', reason: 'Working through a dependency on another team instead of around it.' }],
      probe: 'Who outside your own team did this depend on, and how did you work with them?',
    },
    {
      id: 'making-a-difference',
      name: 'Making a difference',
      competencies: [{ id: 'ownership', reason: 'Treating the outcome, and what it does for users, as yours.' }],
      questions: [
        { id: 'delivery-3', reason: 'Why the thing you shipped mattered, and to whom.' },
        { id: 'customer-5', reason: 'Checking that users were actually better off after a launch.' },
      ],
      probe: 'Who was better off because of this, and how do you know?',
    },
  ],
};

export const cultureFor = (company: TargetCompany | null | undefined): readonly CultureAttribute[] =>
  (company && COMPANY_CULTURES[company]) || [];

/** The attributes a question practices: through its competency, or on its own. */
export const attributesOfQuestion = (company: TargetCompany | null | undefined, questionId: string, competencyId: string) =>
  cultureFor(company).filter((a) => a.competencies.some((c) => c.id === competencyId) || a.questions.some((q) => q.id === questionId));

export const attributesOfCompetency = (company: TargetCompany | null | undefined, competencyId: string) =>
  cultureFor(company).filter((a) => a.competencies.some((c) => c.id === competencyId));

/** Attributes no whole competency practices yet: listed as "Not covered yet", with any single questions that touch them. */
export const notCovered = (company: TargetCompany | null | undefined) => cultureFor(company).filter((a) => !a.competencies.length);
