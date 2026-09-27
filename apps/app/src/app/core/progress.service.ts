import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import {
  buildSession,
  type CodeSubmittedEvent,
  type DiagnosticCompletedEvent,
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
  type SettingsChangedEvent,
  type StoredEvent,
  type StudySettings,
} from '@grasp/engine';
import { ApiService } from './api.service';

const EVENTS_KEY = 'grasp.events';
const SYNCED_KEY = 'grasp.synced';
const CLOCK_TICK_MS = 60_000;
const PROGRESS_PULL_TIMEOUT_MS = 20_000;

type Draft<T> = Omit<T, 'id' | 'at'> & { id?: string; at?: string };

export type NewEvent =
  | Draft<ReviewGradedEvent>
  | Draft<PracticeAnsweredEvent>
  | Draft<PredictAnsweredEvent>
  | Draft<ScenarioCompletedEvent>
  | Draft<InterviewScoredEvent>
  | Draft<CodeSubmittedEvent>
  | Draft<SettingsChangedEvent>
  | Draft<DiagnosticCompletedEvent>;

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline';

/**
 * Local-first learning progress. Every action is an immutable event applied locally and pushed to
 * the API in the background; state is always `replay(events)`, the same reducer the server runs.
 */
@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly api = inject(ApiService);
  private readonly events = signal<StoredEvent[]>([]);
  private synced = new Set<string>();
  private pullFailed = false;
  private syncTimer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private storageWrites: Promise<void> = Promise.resolve();

  /** Wall clock as a signal, so due counts and recall estimates refresh while the app stays open. */
  readonly now = signal(new Date());
  readonly syncStatus = signal<SyncStatus>('idle');

  readonly state = computed(() => replay(this.events()));
  readonly settings = computed(() => this.state().settings, { equal: sameSettings });
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
    void this.resync();
  }

  async record(event: NewEvent): Promise<void> {
    const generation = this.generation;
    const full = { ...event, id: event.id ?? crypto.randomUUID(), at: event.at ?? new Date().toISOString() } as StoredEvent;
    if (this.events().some((e) => e.id === full.id)) return;
    this.events.update((list) => [...list, full]);
    this.now.set(new Date());
    await this.persist();
    if (generation === this.generation) this.scheduleSync();
  }

  /** Pushes everything not yet on the server, now rather than after the usual debounce. */
  async flush(): Promise<void> {
    clearTimeout(this.syncTimer);
    await this.push();
  }

  /** Pulls events from other devices (for example after signing in) and pushes local ones. */
  async resync(): Promise<void> {
    const generation = this.generation;
    this.syncStatus.set('syncing');
    const pulled = await this.pull();
    if (generation !== this.generation) return;
    const pushed = await this.push();
    if (generation === this.generation) this.syncStatus.set(pulled && pushed ? 'synced' : 'offline');
  }

  /** Forgets all local progress, e.g. after the learner erased their server-side data. */
  async clearLocal(): Promise<void> {
    this.generation++;
    clearTimeout(this.syncTimer);
    this.events.set([]);
    this.synced = new Set();
    this.pullFailed = false;
    const clearStorage = this.storageWrites
      .catch(() => undefined)
      .then(async () => {
        await Promise.all([Preferences.remove({ key: EVENTS_KEY }), Preferences.remove({ key: SYNCED_KEY })]);
      });
    this.storageWrites = clearStorage;
    await clearStorage;
    this.syncStatus.set('idle');
  }

  /** Study settings are events too, so they sync and every device schedules identically. */
  updateSettings(change: Partial<StudySettings>): Promise<void> {
    const current = this.settings();
    const changed = Object.fromEntries(Object.entries(change).filter(([k, v]) => current[k as keyof StudySettings] !== v));
    return Object.keys(changed).length ? this.record({ type: 'settings.changed', settings: changed }) : Promise.resolve();
  }

  masteryOf(topic: string) {
    return this.mastery().find((m) => m.topic === topic);
  }

  private scheduleSync() {
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => void this.push(), 1500);
  }

  private async push(): Promise<boolean> {
    const generation = this.generation;
    const pending = this.events().filter((e) => !this.synced.has(e.id));
    if (pending.length === 0) {
      if (generation === this.generation && this.syncStatus() !== 'offline') this.syncStatus.set(this.pullFailed ? 'offline' : 'synced');
      return true;
    }
    this.syncStatus.set('syncing');
    try {
      for (let i = 0; i < pending.length; i += 500) {
        if (generation !== this.generation) return true;
        const batch = pending.slice(i, i + 500);
        await this.api.post('/progress/events', { events: batch });
        if (generation !== this.generation) return true;
        batch.forEach((e) => this.synced.add(e.id));
      }
      await this.write(SYNCED_KEY, JSON.stringify([...this.synced]), generation);
      if (generation !== this.generation) return true;
      this.syncStatus.set(this.pullFailed ? 'offline' : 'synced');
      return true;
    } catch {
      if (generation !== this.generation) return true;
      this.syncStatus.set('offline');
      return false;
    }
  }

  /** Merges events recorded on other devices; the log is a grow-only set keyed by event id. */
  private async pull(): Promise<boolean> {
    const generation = this.generation;
    try {
      const { events } = await this.api.get<{ events: StoredEvent[] }>('/progress/events', PROGRESS_PULL_TIMEOUT_MS);
      if (generation !== this.generation) return true;
      const known = new Set(this.events().map((e) => e.id));
      const incoming = events.filter((e) => !known.has(e.id));
      events.forEach((e) => this.synced.add(e.id));
      if (incoming.length) {
        this.events.update((list) => [...list, ...incoming]);
        await this.persist();
      }
      if (generation !== this.generation) return true;
      this.pullFailed = false;
      return true;
    } catch {
      if (generation !== this.generation) return true;
      this.pullFailed = true;
      this.syncStatus.set('offline');
      return false;
    }
  }

  private persist() {
    return this.write(EVENTS_KEY, JSON.stringify(this.events()), this.generation);
  }

  private write(key: string, value: string, generation: number): Promise<void> {
    const write = this.storageWrites
      .catch(() => undefined)
      .then(async () => {
        if (generation === this.generation) await Preferences.set({ key, value });
      });
    this.storageWrites = write;
    return write;
  }
}

function sameSettings(a: StudySettings, b: StudySettings) {
  return a.retention === b.retention && a.budgetMinutes === b.budgetMinutes && a.newPerDay === b.newPerDay;
}
