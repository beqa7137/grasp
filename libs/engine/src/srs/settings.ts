import type { StudySettings } from './events.js';
import { RETENTION_OPTIONS, SCHEDULER_CONFIG, isRetentionOption } from './scheduler.js';

export const BUDGET_OPTIONS = [5, 10, 15, 20, 30, 45] as const;
export const NEW_PER_DAY_OPTIONS = [0, 5, 10, 15, 20, 30] as const;

export const DEFAULT_STUDY_SETTINGS: StudySettings = {
  retention: SCHEDULER_CONFIG.requestRetention,
  budgetMinutes: 10,
  newPerDay: 10,
};

export const STUDY_OPTIONS = {
  retention: RETENTION_OPTIONS,
  budgetMinutes: BUDGET_OPTIONS,
  newPerDay: NEW_PER_DAY_OPTIONS,
} as const;

/** Applies a settings change, ignoring values outside the offered options (e.g. from an older or newer client). */
export function mergeSettings(current: StudySettings, change: Partial<StudySettings>): StudySettings {
  return {
    retention: isRetentionOption(change.retention) ? change.retention : current.retention,
    budgetMinutes: (BUDGET_OPTIONS as readonly number[]).includes(change.budgetMinutes as number)
      ? change.budgetMinutes!
      : current.budgetMinutes,
    newPerDay: (NEW_PER_DAY_OPTIONS as readonly number[]).includes(change.newPerDay as number) ? change.newPerDay! : current.newPerDay,
  };
}
