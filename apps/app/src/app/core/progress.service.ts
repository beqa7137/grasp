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
import { LearnerService } from './learner.service';
import { clearDrafts } from './local-drafts';
import { packProgressEvents, readProgressAcknowledgement } from './progress-upload';

const EVENTS_KEY = 'grasp.events';
const ACKNOWLEDGED_KEY = 'grasp.acknowledged.v1';
const LEGACY_SYNCED_KEY = 'grasp.synced';
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

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'pending';

interface SyncScope {
  generation: number;
  learnerId: string;
  controller: AbortController;
  pull?: Promise<void>;
  upload?: Promise<void>;
  pullFailed: boolean;
  pushFailed: boolean;
}

/**
 * Local-first learning progress. Every action is an immutable event applied locally and pushed to
 * the API in the background; state is always `replay(events)`, the same reducer the server runs.
 */
@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly api = inject(ApiService);
  private readonly learner = inject(LearnerService);
  private readonly events = signal<StoredEvent[]>([]);
  private acknowledged = new Set<string>();
  private readonly deferredFuture = new Set<string>();
  private readonly oversized = new Set<string>();
  private acknowledgementVersion = 0;
  private checkpointVersion = 0;
  private scope: SyncScope | undefined;
  private syncTimer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private storageWrites: Promise<void> = Promise.resolve();
  private initializing: Promise<void> | undefined;
  private destroyed = false;

  /** Wall clock as a signal, so due counts and recall estimates refresh while the app stays open. */
  readonly now = signal(new Date());
  readonly syncStatus = signal<SyncStatus>('idle');
  readonly pendingSync = signal({ future: 0, oversized: 0 });

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
      this.destroyed = true;
      this.initializing = undefined;
      this.invalidateSync();
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  init(): Promise<void> {
    if (this.initializing) return this.initializing;
    const generation = this.generation;
    let loaded = false;
    const initializing = Promise.all([Preferences.get({ key: EVENTS_KEY }), Preferences.get({ key: ACKNOWLEDGED_KEY })])
      .then(([events, acknowledged]) => {
        if (generation !== this.generation || this.destroyed) return;
        this.events.set(events.value ? JSON.parse(events.value) : []);
        this.acknowledged = new Set(acknowledged.value ? JSON.parse(acknowledged.value) : []);
        loaded = true;
      })
      .finally(() => {
        if (this.initializing !== initializing) return;
        this.initializing = undefined;
        if (loaded && generation === this.generation) void this.resync();
      });
    this.initializing = initializing;
    return initializing;
  }

  async record(event: NewEvent): Promise<void> {
    const generation = this.generation;
    if (this.initializing) await this.initializing;
    if (generation !== this.generation || this.destroyed) return;
    const full = JSON.parse(
      JSON.stringify({
        ...event,
        id: event.id ?? crypto.randomUUID(),
        at: event.at ?? new Date().toISOString(),
      }),
    ) as StoredEvent;
    if (this.events().some((e) => e.id === full.id)) return;
    this.events.update((list) => [...list, full]);
    this.now.set(new Date());
    this.updateStatus();
    await this.persist();
    if (generation === this.generation && !this.destroyed) this.scheduleSync();
  }

  flush(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    if (this.initializing) return this.afterInitialization(() => this.flush());
    clearTimeout(this.syncTimer);
    return this.push(this.currentScope());
  }

  resync(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    if (this.initializing) return this.afterInitialization(() => this.resync());
    const scope = this.currentScope();
    if (scope.pull) return scope.pull;
    const pull = Promise.resolve()
      .then(async () => {
        await this.pull(scope);
        if (this.isCurrent(scope)) await this.push(scope);
      })
      .finally(() => {
        if (scope.pull === pull) scope.pull = undefined;
        if (this.isCurrent(scope)) this.updateStatus();
      });
    scope.pull = pull;
    this.updateStatus();
    return pull;
  }

  invalidateSync(): void {
    clearTimeout(this.syncTimer);
    const scope = this.scope;
    this.scope = undefined;
    scope?.controller.abort();
    this.updateStatus();
  }

  async clearLocal(): Promise<void> {
    this.generation++;
    this.initializing = undefined;
    this.invalidateSync();
    this.events.set([]);
    this.acknowledged = new Set();
    this.deferredFuture.clear();
    this.oversized.clear();
    this.acknowledgementVersion = 0;
    this.checkpointVersion = 0;
    this.pendingSync.set({ future: 0, oversized: 0 });
    this.syncStatus.set('idle');
    const clearStorage = this.storageWrites
      .catch(() => undefined)
      .then(async () => {
        await Promise.all([
          Preferences.remove({ key: EVENTS_KEY }),
          Preferences.remove({ key: ACKNOWLEDGED_KEY }),
          Preferences.remove({ key: LEGACY_SYNCED_KEY }),
          clearDrafts(),
        ]);
      });
    this.storageWrites = clearStorage;
    await clearStorage;
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

  private async afterInitialization(sync: () => Promise<void>): Promise<void> {
    const generation = this.generation;
    await this.initializing;
    if (generation === this.generation) await sync();
  }

  private scheduleSync() {
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => void this.flush(), 1500);
  }

  private currentScope(): SyncScope {
    if (this.scope && this.isCurrent(this.scope)) return this.scope;
    this.invalidateSync();
    this.scope = {
      generation: this.generation,
      learnerId: this.learner.id(),
      controller: new AbortController(),
      pullFailed: false,
      pushFailed: false,
    };
    return this.scope;
  }

  private isCurrent(scope: SyncScope): boolean {
    return !this.destroyed && this.scope === scope && scope.generation === this.generation && scope.learnerId === this.learner.id();
  }

  private push(scope: SyncScope): Promise<void> {
    if (scope.upload) return scope.upload;
    const upload = Promise.resolve().then(() => this.drain(scope));
    scope.upload = upload;
    this.updateStatus();
    return upload;
  }

  private async drain(scope: SyncScope): Promise<void> {
    const operation = scope.upload;
    const attempted = new Set<string>();
    scope.pushFailed = false;
    try {
      while (this.isCurrent(scope)) {
        const pending = this.events().filter((event) => !this.acknowledged.has(event.id) && !attempted.has(event.id));
        if (!pending.length) {
          await this.checkpoint(scope);
          if (!this.isCurrent(scope) || !this.events().some((event) => !this.acknowledged.has(event.id) && !attempted.has(event.id)))
            return;
          continue;
        }
        for (const upload of packProgressEvents(pending)) {
          if (!this.isCurrent(scope)) return;
          if (upload.kind === 'oversized') {
            attempted.add(upload.id);
            if (!this.acknowledged.has(upload.id)) this.oversized.add(upload.id);
            continue;
          }
          const events = upload.events.filter((event) => !this.acknowledged.has(event.id));
          if (!events.length) continue;
          events.forEach((event) => attempted.add(event.id));
          const response = await this.api.post('/progress/events', { events }, undefined, scope.controller.signal);
          if (!this.isCurrent(scope)) return;
          const acknowledgement = readProgressAcknowledgement(response, events);
          this.acknowledge(acknowledgement.acknowledgedIds);
          acknowledgement.deferredFutureIds.forEach((id) => {
            if (!this.acknowledged.has(id)) this.deferredFuture.add(id);
          });
        }
      }
    } catch {
      if (this.isCurrent(scope)) {
        scope.pushFailed = true;
        await this.checkpoint(scope).catch(() => undefined);
      }
    } finally {
      if (scope.upload === operation) scope.upload = undefined;
      if (this.isCurrent(scope)) this.updateStatus();
    }
  }

  private async pull(scope: SyncScope): Promise<void> {
    try {
      const { events } = await this.api.get<{ events: StoredEvent[] }>(
        '/progress/events',
        PROGRESS_PULL_TIMEOUT_MS,
        scope.controller.signal,
      );
      if (!this.isCurrent(scope)) return;
      const known = new Set(this.events().map((event) => event.id));
      const incoming = events.filter((event) => !known.has(event.id));
      this.acknowledge(events.map((event) => event.id));
      if (incoming.length) {
        this.events.update((list) => [...list, ...incoming]);
        await this.persist();
      }
      if (!this.isCurrent(scope)) return;
      await this.checkpoint(scope);
      if (this.isCurrent(scope)) scope.pullFailed = false;
    } catch {
      if (this.isCurrent(scope)) scope.pullFailed = true;
    }
  }

  private acknowledge(ids: readonly string[]): void {
    for (const id of ids) {
      if (!this.acknowledged.has(id)) {
        this.acknowledged.add(id);
        this.acknowledgementVersion++;
      }
      this.deferredFuture.delete(id);
      this.oversized.delete(id);
    }
  }

  private async checkpoint(scope: SyncScope): Promise<void> {
    if (!this.isCurrent(scope) || this.checkpointVersion === this.acknowledgementVersion) return;
    const version = this.acknowledgementVersion;
    await this.write(ACKNOWLEDGED_KEY, JSON.stringify([...this.acknowledged]), scope.generation);
    if (scope.generation === this.generation) this.checkpointVersion = Math.max(this.checkpointVersion, version);
  }

  private updateStatus(): void {
    this.pendingSync.set({ future: this.deferredFuture.size, oversized: this.oversized.size });
    const scope = this.scope;
    if (scope?.pull || scope?.upload) this.syncStatus.set('syncing');
    else if (scope?.pullFailed || scope?.pushFailed) this.syncStatus.set('offline');
    else if (this.deferredFuture.size || this.oversized.size) this.syncStatus.set('pending');
    else this.syncStatus.set(scope ? 'synced' : 'idle');
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
