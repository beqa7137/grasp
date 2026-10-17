/** Companies an interview report can name, in the order source lists show them; `TARGET_COMPANIES` ids are a subset. */
export const COMPANY_NAMES = {
  google: 'Google',
  meta: 'Meta',
  amazon: 'Amazon',
  microsoft: 'Microsoft',
  apple: 'Apple',
  uber: 'Uber',
} as const;

export type CompanyId = keyof typeof COMPANY_NAMES;

export const COMPANY_IDS = Object.keys(COMPANY_NAMES) as CompanyId[];
