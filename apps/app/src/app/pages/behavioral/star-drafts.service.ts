import { Injectable, computed, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { COMPETENCY_CATALOG, EMPTY_STAR_DRAFT, QUESTIONS_PER_COMPETENCY, isEmptyDraft, type StarDraft } from '@grasp/engine';
import { STAR_DRAFT_PREFIX, draftKeys } from '../../core/local-drafts';

/** Every current question's id: a draft kept for a question that no longer exists is not counted. */
const QUESTION_IDS = new Set(
  COMPETENCY_CATALOG.flatMap((c) => Array.from({ length: QUESTIONS_PER_COMPETENCY }, (_, i) => `${c.id}-${i + 1}`)),
);

@Injectable({ providedIn: 'root' })
export class StarDraftsService {
  private readonly drafted = signal<ReadonlySet<string>>(new Set());
  /** False until the drafts have been read once, so a list never says "nothing drafted" before it knows. */
  readonly loaded = signal(false);
  readonly count = computed(() => this.drafted().size);

  async load(): Promise<void> {
    const keys = await draftKeys(STAR_DRAFT_PREFIX);
    this.drafted.set(new Set(keys.map((key) => key.slice(STAR_DRAFT_PREFIX.length)).filter((id) => QUESTION_IDS.has(id))));
    this.loaded.set(true);
  }

  isDrafted(questionId: string): boolean {
    return this.drafted().has(questionId);
  }

  draftedIn(competencyId: string): number {
    return [...this.drafted()].filter((id) => id.slice(0, id.lastIndexOf('-')) === competencyId).length;
  }

  async get(questionId: string): Promise<StarDraft> {
    const { value } = await Preferences.get({ key: STAR_DRAFT_PREFIX + questionId });
    return value ? { ...EMPTY_STAR_DRAFT, ...(JSON.parse(value) as Partial<StarDraft>) } : { ...EMPTY_STAR_DRAFT };
  }

  async save(questionId: string, draft: StarDraft): Promise<void> {
    const key = STAR_DRAFT_PREFIX + questionId;
    const empty = isEmptyDraft(draft);
    await (empty ? Preferences.remove({ key }) : Preferences.set({ key, value: JSON.stringify(draft) }));
    this.drafted.update((ids) => {
      const next = new Set(ids);
      if (empty) next.delete(questionId);
      else if (QUESTION_IDS.has(questionId)) next.add(questionId);
      return next;
    });
  }
}
