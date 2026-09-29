import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import type { StarDraft } from '@grasp/engine';
import { STAR_DRAFT_PREFIX, draftKeys } from '../../core/local-drafts';

export const EMPTY_DRAFT: StarDraft = { situation: '', task: '', action: '', result: '', reflection: '' };
export const isEmptyDraft = (draft: StarDraft) => Object.values(draft).every((text) => !text.trim());

@Injectable({ providedIn: 'root' })
export class StarDraftsService {
  private readonly drafted = signal<ReadonlySet<string>>(new Set());

  async load(): Promise<void> {
    const keys = await draftKeys(STAR_DRAFT_PREFIX);
    this.drafted.set(new Set(keys.map((key) => key.slice(STAR_DRAFT_PREFIX.length))));
  }

  isDrafted(questionId: string): boolean {
    return this.drafted().has(questionId);
  }

  draftedIn(competencyId: string): number {
    return [...this.drafted()].filter((id) => id.slice(0, id.lastIndexOf('-')) === competencyId).length;
  }

  async get(questionId: string): Promise<StarDraft> {
    const { value } = await Preferences.get({ key: STAR_DRAFT_PREFIX + questionId });
    return value ? { ...EMPTY_DRAFT, ...(JSON.parse(value) as Partial<StarDraft>) } : { ...EMPTY_DRAFT };
  }

  async save(questionId: string, draft: StarDraft): Promise<void> {
    const key = STAR_DRAFT_PREFIX + questionId;
    const empty = isEmptyDraft(draft);
    await (empty ? Preferences.remove({ key }) : Preferences.set({ key, value: JSON.stringify(draft) }));
    this.drafted.update((ids) => {
      const next = new Set(ids);
      if (empty) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }
}
