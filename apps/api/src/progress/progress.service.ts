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
    const serverTime = new Date();
    const limit = serverTime.getTime() + FUTURE_TOLERANCE_MS;
    const eligible: StoredEvent[] = [];
    const deferredFutureIds: string[] = [];
    for (const event of events) {
      if (Date.parse(event.at) <= limit) eligible.push(event);
      else deferredFutureIds.push(event.id);
    }
    const result = await this.store.append(learnerId, eligible);
    return {
      ...result,
      rejectedFuture: deferredFutureIds.length,
      acknowledgedIds: eligible.map((event) => event.id),
      deferredFutureIds,
      serverTime: serverTime.toISOString(),
    };
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
