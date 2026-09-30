import { Injectable } from '@nestjs/common';
import { isNewer, STORY_LIMITS, type Story } from '@grasp/engine';
import { MemoryLearnerState } from './erasure.stores.js';
import { MAX_TOMBSTONES, StoryStore, storedAt, storyLimitReached } from './story.store.js';

const byChange = (a: Story, b: Story) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt);

@Injectable()
export class MemoryStoryStore extends StoryStore {
  private readonly stories = new Map<string, Map<string, Story>>();

  constructor(private readonly learnerState = new MemoryLearnerState()) {
    super();
  }

  async list(learnerId: string): Promise<Story[]> {
    return [...(this.stories.get(learnerId)?.values() ?? [])].sort(byChange).map((story) => structuredClone(story));
  }

  async put(learnerId: string, story: Story, now = new Date()): Promise<Story> {
    this.learnerState.assertActive(learnerId);
    const bank = this.stories.get(learnerId) ?? new Map<string, Story>();
    const stored = bank.get(story.id);
    if (stored && !isNewer(story, stored)) return structuredClone(stored);
    if (story.deleted && !stored) return storedAt(story, undefined, now);
    const live = [...bank.values()].filter((s) => !s.deleted).length;
    if (!story.deleted && (!stored || stored.deleted) && live >= STORY_LIMITS.stories) throw storyLimitReached();
    const saved = storedAt(story, stored, now);
    bank.set(story.id, structuredClone(saved));
    this.stories.set(learnerId, bank);
    const tombstones = [...bank.values()].filter((s) => s.deleted).sort(byChange);
    for (const old of tombstones.slice(0, -MAX_TOMBSTONES)) bank.delete(old.id);
    return structuredClone(saved);
  }

  async deleteLearner(learnerId: string): Promise<void> {
    this.stories.delete(learnerId);
  }
}
