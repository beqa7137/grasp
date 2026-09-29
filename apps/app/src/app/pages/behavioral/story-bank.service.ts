import { Injectable, computed, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { EMPTY_STAR_DRAFT, isEmptyDraft, rehearse, reviewBank, type Story } from '@grasp/engine';
import { STORY_BANK_KEY } from '../../core/local-drafts';

const isBlank = (story: Story) => !story.title.trim() && !story.competencyIds.length && isEmptyDraft(story.draft);

@Injectable({ providedIn: 'root' })
export class StoryBankService {
  private readonly all = signal<readonly Story[]>([]);
  readonly stories = this.all.asReadonly();
  readonly review = computed(() => reviewBank(this.all()));
  private queue = Promise.resolve();

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
    return { id, title: '', competencyIds: [], draft: { ...EMPTY_STAR_DRAFT } };
  }

  /** A story with no title, tags or text is not kept, the way an empty STAR draft is not. */
  save(story: Story): Promise<void> {
    return this.change((stories) => {
      const others = stories.filter((s) => s.id !== story.id);
      if (isBlank(story)) return others;
      return others.length < stories.length ? stories.map((s) => (s.id === story.id ? story : s)) : [...stories, story];
    });
  }

  rehearse(id: string, toldWell: boolean): Promise<void> {
    const now = new Date();
    return this.change((stories) => stories.map((s) => (s.id === id ? rehearse(s, toldWell, now) : s)));
  }

  remove(id: string): Promise<void> {
    return this.change((stories) => stories.filter((s) => s.id !== id));
  }

  /**
   * Each change starts from what is stored, not from memory, so erasing the learner's data while a story is open is not
   * undone by the next keystroke; the queue keeps fast keystrokes from overwriting each other.
   */
  private change(apply: (stories: readonly Story[]) => readonly Story[]): Promise<void> {
    const run = this.queue.then(async () => {
      await this.load();
      await this.store(apply(this.all()));
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async store(stories: readonly Story[]): Promise<void> {
    this.all.set(stories);
    await (stories.length
      ? Preferences.set({ key: STORY_BANK_KEY, value: JSON.stringify(stories) })
      : Preferences.remove({ key: STORY_BANK_KEY }));
  }
}
