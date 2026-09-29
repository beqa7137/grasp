import { Injectable, computed, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { reviewBank, type Story } from '@grasp/engine';
import { STORY_BANK_KEY } from '../../core/local-drafts';
import { EMPTY_DRAFT, isEmptyDraft } from './star-drafts.service';

const isBlank = (story: Story) => !story.title.trim() && !story.competencyIds.length && isEmptyDraft(story.draft);

@Injectable({ providedIn: 'root' })
export class StoryBankService {
  private readonly all = signal<readonly Story[]>([]);
  readonly stories = this.all.asReadonly();
  readonly review = computed(() => reviewBank(this.all()));

  async load(): Promise<void> {
    const { value } = await Preferences.get({ key: STORY_BANK_KEY });
    this.all.set(value ? (JSON.parse(value) as Story[]) : []);
  }

  get(id: string): Story | undefined {
    return this.all().find((s) => s.id === id);
  }

  tagged(competencyId: string): Story[] {
    return this.all().filter((s) => s.competencyIds.includes(competencyId));
  }

  blank(id = Date.now().toString(36)): Story {
    return { id, title: '', competencyIds: [], draft: { ...EMPTY_DRAFT } };
  }

  /** A story with no title, tags or text is not kept, the way an empty STAR draft is not. */
  save(story: Story): Promise<void> {
    const others = this.all().filter((s) => s.id !== story.id);
    const exists = others.length < this.all().length;
    if (isBlank(story)) return this.store(others);
    return this.store(exists ? this.all().map((s) => (s.id === story.id ? story : s)) : [...others, story]);
  }

  remove(id: string): Promise<void> {
    return this.store(this.all().filter((s) => s.id !== id));
  }

  private async store(stories: readonly Story[]): Promise<void> {
    this.all.set(stories);
    await (stories.length
      ? Preferences.set({ key: STORY_BANK_KEY, value: JSON.stringify(stories) })
      : Preferences.remove({ key: STORY_BANK_KEY }));
  }
}
