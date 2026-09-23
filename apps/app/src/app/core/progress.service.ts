import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import {
  buildSession,
  forecast,
  masteryByTopic,
  missionRevisits,
  replay,
  trueRetention,
  type InterviewScoredEvent,
  type PracticeAnsweredEvent,
  type PredictAnsweredEvent,
  type ReviewGradedEvent,
  type ScenarioCompletedEvent,
  type StoredEvent,
} from '@grasp/engine';
import { ApiService } from './api.service';

const EVENTS_KEY = 'grasp.events';
const SYNCED_KEY = 'grasp.synced';
const CLOCK_TICK_MS = 60_000;

type Draft<T> = Omit<T, 'id' | 'at'> & { id?: string; at?: string };

export type NewEvent =
  | Draft<ReviewGradedEvent>
  | Draft<PracticeAnsweredEvent>
  | Draft<PredictAnsweredEvent>
  | Draft<ScenarioCompletedEvent>
  | Draft<InterviewScoredEvent>;

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline';

/**
 * Local-first learning progress. Every action is an immutable event applied locally and pushed to
 * the API in the background; state is always `replay(events)` — the same reducer the server runs.
 */
@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly api = inject(ApiService);
  private readonly events = signal<StoredEvent[]>([]);
  private synced = new Set<string>();
  private syncTimer: ReturnType<typeof setTimeout> | undefined;

  /** Wall clock as a signal, so due counts and recall estimates refresh while the app stays open. */
  readonly now = signal(new Date());
  readonly syncStatus = signal<SyncStatus>('idle');

  readonly state = computed(() => replay(this.events()));
  readonly mastery = computed(() => masteryByTopic(this.state(), this.now()));
  readonly session = computed(() => buildSession(this.state(), { now: this.now(), tzOffsetMinutes: this.now().getTimezoneOffset() }));
  readonly retention = computed(() => trueRetention(this.state(), this.now()));
  readonly forecast = computed(() => forecast(this.state(), this.now(), 7, this.now().getTimezoneOffset()));
  readonly missions = computed(() => missionRevisits(this.state(), this.now()));
  readonly dueMissions = computed(() => this.missions().filter((m) => m.due));

  constructor() {
    const tick = setInterval(() => this.now.set(new Date()), CLOCK_TICK_MS);
    const onVisible = () => document.visibilityState === 'visible' && this.now.set(new Date());
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  async init(): Promise<void> {
    const [events, synced] = await Promise.all([Preferences.get({ key: EVENTS_KEY }), Preferences.get({ key: SYNCED_KEY })]);
    this.events.set(events.value ? JSON.parse(events.value) : []);
    this.synced = new Set(synced.value ? JSON.parse(synced.value) : []);
    void this.pull().then(() => this.push());
  }

  async record(event: NewEvent): Promise<void> {
    const full = { ...event, id: event.id ?? crypto.randomUUID(), at: event.at ?? new Date().toISOString() } as StoredEvent;
    if (this.events().some((e) => e.id === full.id)) return;
    this.events.update((list) => [...list, full]);
    this.now.set(new Date());
    await this.persist();
    this.scheduleSync();
  }

  /** Forgets all local progress, e.g. after the learner erased their server-side data. */
  async clearLocal(): Promise<void> {
    clearTimeout(this.syncTimer);
    this.events.set([]);
    this.synced = new Set();
    await Promise.all([Preferences.remove({ key: EVENTS_KEY }), Preferences.remove({ key: SYNCED_KEY })]);
    this.syncStatus.set('idle');
  }

  masteryOf(topic: string) {
    return this.mastery().find((m) => m.topic === topic);
  }

  private scheduleSync() {
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => void this.push(), 1500);
  }

  private async push() {
    const pending = this.events().filter((e) => !this.synced.has(e.id));
    if (pending.length === 0) {
      if (this.syncStatus() !== 'offline') this.syncStatus.set('synced');
      return;
    }
    this.syncStatus.set('syncing');
    try {
      for (let i = 0; i < pending.length; i += 500) {
        const batch = pending.slice(i, i + 500);
        await this.api.post('/progress/events', { events: batch });
        batch.forEach((e) => this.synced.add(e.id));
      }
      await Preferences.set({ key: SYNCED_KEY, value: JSON.stringify([...this.synced]) });
      this.syncStatus.set('synced');
    } catch {
      this.syncStatus.set('offline');
    }
  }

  /** Merges events recorded on other devices; the log is a grow-only set keyed by event id. */
  private async pull() {
    try {
      const { events } = await this.api.get<{ events: StoredEvent[] }>('/progress/events');
      const known = new Set(this.events().map((e) => e.id));
      const incoming = events.filter((e) => !known.has(e.id));
      events.forEach((e) => this.synced.add(e.id));
      if (incoming.length) {
        this.events.update((list) => [...list, ...incoming]);
        await this.persist();
      }
    } catch {
      this.syncStatus.set('offline');
    }
  }

  private persist() {
    return Preferences.set({ key: EVENTS_KEY, value: JSON.stringify(this.events()) });
  }
}
