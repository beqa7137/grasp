import { randomUUID } from 'node:crypto';
import { MemoryLearnerState } from './erasure.stores.js';
import { MemoryStoryStore } from './memory-story.store.js';
import { storyStoreContract } from './story-store.contract.js';

storyStoreContract('in-memory', () => {
  const state = new MemoryLearnerState();
  const store = new MemoryStoryStore(state);
  return {
    store,
    learner: async () => randomUUID(),
    erase: async (learnerId) => {
      state.erase(learnerId);
      await store.deleteLearner(learnerId);
    },
  };
});
