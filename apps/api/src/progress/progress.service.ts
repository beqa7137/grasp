import { Injectable } from '@nestjs/common';
import {
  buildSession,
  forecast,
  masteryByTopic,
  missionRevisits,
  replay,
  sortEvents,
  trueRetention,
  type StoredEvent,
} from '@grasp/engine';
import { ProgressStore } from '../persistence/stores.js';

const FUTURE_TOLERANCE_MS = 5 * 60_000;

@Injectable()
export class ProgressService {
  constructor(private readonly store: ProgressStore) {}

  async ingest(learnerId: string, events: StoredEvent[]) {
    const limit = Date.now() + FUTURE_TOLERANCE_MS;
    const accepted = events.filter((e) => Date.parse(e.at) <= limit);
    const result = await this.store.append(learnerId, accepted);
    return { ...result, rejectedFuture: events.length - accepted.length };
  }

  async events(learnerId: string) {
    return { events: sortEvents(await this.store.list(learnerId)) };
  }

  async snapshot(learnerId: string, now = new Date()) {
    const state = replay(await this.store.list(learnerId));
    const session = buildSession(state, { now });
    return {
      state,
      mastery: masteryByTopic(state, now),
      retention: trueRetention(state, now),
      forecast: forecast(state, now),
      missions: missionRevisits(state, now),
      session: { ...session, items: session.items.map((i) => i.itemId) },
    };
  }
}
