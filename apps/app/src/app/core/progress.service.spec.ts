import { Preferences } from '@capacitor/preferences';
import type { StoredEvent } from '@grasp/engine';
import { TestBed } from '@angular/core/testing';
import { ApiError } from './api.service';
import { ApiService } from './api.service';
import { LearnerService } from './learner.service';
import { ProgressService } from './progress.service';

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: localStorage.getItem(`CapacitorStorage.${key}`) })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => localStorage.setItem(`CapacitorStorage.${key}`, value)),
    remove: vi.fn(async ({ key }: { key: string }) => localStorage.removeItem(`CapacitorStorage.${key}`)),
  },
}));

const ACK_KEY = 'CapacitorStorage.grasp.acknowledged.v1';
const EVENTS_KEY = 'CapacitorStorage.grasp.events';
const at = '2026-09-26T00:00:00.000Z';
const settingsEvent = (id: string): Extract<StoredEvent, { type: 'settings.changed' }> => ({
  id,
  at,
  type: 'settings.changed',
  settings: { newPerDay: 5 },
});
const acknowledgement = (events: readonly Pick<StoredEvent, 'id'>[], future: string[] = []) => ({
  acknowledgedIds: events.filter((item) => !future.includes(item.id)).map((item) => item.id),
  deferredFutureIds: future,
  serverTime: at,
});
function gate<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup(
  options: {
    get?: () => Promise<{ events: StoredEvent[] }>;
    post?: (events: StoredEvent[]) => Promise<unknown>;
  } = {},
) {
  const learner = { value: 'learner-one' };
  const api = {
    get: vi.fn(options.get ?? (async () => ({ events: [] }))),
    post: vi.fn(async (_path: string, body: { events: StoredEvent[] }) =>
      options.post ? options.post(body.events) : acknowledgement(body.events),
    ),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: ApiService, useValue: api },
      { provide: LearnerService, useValue: { id: () => learner.value } },
    ],
  });
  return { progress: TestBed.inject(ProgressService), api, learner };
}
const checkpoint = (): string[] => JSON.parse(localStorage.getItem(ACK_KEY) ?? '[]');

describe('ProgressService sync', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('keeps a failed pull visible and clears the failure after a successful retry', async () => {
    let available = false;
    const api = {
      get: vi.fn(async () => {
        if (!available) throw new Error('Database unavailable');
        return { events: [] };
      }),
      post: vi.fn(async (_path: string, body: { events: StoredEvent[] }) => acknowledgement(body.events)),
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    const progress = TestBed.inject(ProgressService);

    await progress.resync();
    expect(progress.syncStatus()).toBe('offline');

    await progress.record({
      type: 'settings.changed',
      settings: { newPerDay: 5 },
      id: 'local-change',
      at: '2026-09-26T00:00:00.000Z',
    });
    await progress.flush();
    expect(progress.syncStatus()).toBe('offline');
    expect(api.post).toHaveBeenCalledTimes(1);

    available = true;
    await progress.resync();
    expect(progress.syncStatus()).toBe('synced');
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.get).toHaveBeenCalledWith('/progress/events', 20_000, expect.any(AbortSignal));
  });

  it('drops an erased learner batch and never sends it under the fresh learner', async () => {
    let progress!: ProgressService;
    const posted: string[][] = [];
    const api = {
      get: async () => ({ events: [] }),
      post: async (_path: string, body: { events: { id: string }[] }) => {
        posted.push(body.events.map((event) => event.id));
        if (posted.length === 1) {
          await progress.clearLocal();
          throw new ApiError(410, 'Learner erased', 'learner_erased');
        }
        return acknowledgement(body.events);
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    progress = TestBed.inject(ProgressService);

    await progress.record({ type: 'settings.changed', settings: { newPerDay: 5 }, id: 'erased-event' });
    await progress.flush();
    expect(progress.syncStatus()).toBe('idle');
    expect(localStorage.getItem('CapacitorStorage.grasp.events')).toBeNull();

    await progress.record({ type: 'settings.changed', settings: { newPerDay: 6 }, id: 'fresh-event' });
    await progress.flush();
    expect(posted).toEqual([['erased-event'], ['fresh-event']]);
    expect(progress.syncStatus()).toBe('synced');
  });

  it('discards a pull that completes after the learner was reset', async () => {
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => (release = resolve));
    const api = {
      get: async () => {
        await delayed;
        return { events: [{ type: 'settings.changed', settings: { newPerDay: 5 }, id: 'old-pull', at: '2026-09-26T00:00:00.000Z' }] };
      },
      post: vi.fn(async (_path: string, body: { events: StoredEvent[] }) => acknowledgement(body.events)),
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    const progress = TestBed.inject(ProgressService);

    const resync = progress.resync();
    await progress.clearLocal();
    release();
    await resync;

    expect(localStorage.getItem('CapacitorStorage.grasp.events')).toBeNull();
    expect(progress.syncStatus()).toBe('idle');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('starts fresh from a retired learner read even with no pending events', async () => {
    let progress!: ProgressService;
    const api = {
      get: async () => {
        await progress.clearLocal();
        throw new ApiError(410, 'Learner erased', 'learner_erased');
      },
      post: vi.fn(async (_path: string, body: { events: StoredEvent[] }) => acknowledgement(body.events)),
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    progress = TestBed.inject(ProgressService);

    await progress.resync();

    expect(progress.syncStatus()).toBe('idle');
    expect(api.post).not.toHaveBeenCalled();
  });
  it('does not report an event waiting for the upload debounce as pending', async () => {
    vi.useFakeTimers();
    const { progress, api } = setup();
    await progress.resync();
    await progress.record(settingsEvent('one'));
    expect(progress.syncStatus()).toBe('synced');
    await vi.advanceTimersByTimeAsync(1500);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(progress.syncStatus()).toBe('synced');
  });
  it('keeps deferred future events pending, acknowledges valid neighbors, and retries the same immutable event', async () => {
    let future = true;
    const { progress, api } = setup({ post: async (events) => acknowledgement(events, future ? ['future'] : []) });
    await progress.record({ ...settingsEvent('future'), at: '2030-01-01T00:00:00.000Z' });
    await progress.record(settingsEvent('valid'));
    await progress.flush();
    expect(checkpoint()).toEqual(['valid']);
    expect(progress.pendingSync()).toEqual({ future: 1, oversized: 0 });
    expect(progress.syncStatus()).toBe('pending');
    future = false;
    await progress.flush();
    expect(api.post.mock.calls.map((call) => call[1].events.map((item) => item.id))).toEqual([['future', 'valid'], ['future']]);
    expect(api.post.mock.calls[1][1].events[0].at).toBe('2030-01-01T00:00:00.000Z');
    expect(checkpoint()).toEqual(['valid', 'future']);
    expect(progress.pendingSync()).toEqual({ future: 0, oversized: 0 });
    expect(progress.syncStatus()).toBe('synced');
  });

  it.each([
    { accepted: 1, duplicates: 0, rejectedFuture: 0 },
    { acknowledgedIds: ['one'], deferredFutureIds: [], serverTime: at },
    { acknowledgedIds: ['one', 'two'], deferredFutureIds: ['two'], serverTime: at },
    { acknowledgedIds: ['one', 'foreign'], deferredFutureIds: [], serverTime: at },
  ])('does not partially acknowledge a malformed successful response: %j', async (response) => {
    const { progress, api } = setup({ post: async () => response });
    await progress.record(settingsEvent('one'));
    await progress.record(settingsEvent('two'));
    await progress.flush();
    expect(checkpoint()).toEqual([]);
    expect(progress.syncStatus()).toBe('offline');
    await progress.flush();
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(api.post.mock.calls[1][1].events.map((item) => item.id)).toEqual(['one', 'two']);
  });

  it('persists an acknowledged prefix when a later batch fails and replays only uncertain events', async () => {
    let fail = true;
    const events = Array.from({ length: 502 }, (_, i) => settingsEvent(`event-${i}`));
    localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
    const { progress, api } = setup({
      post: async (batch) => {
        if (batch[0].id === 'event-500' && fail) throw new Error('response lost');
        return acknowledgement(batch);
      },
    });
    await progress.init();
    await progress.resync();
    expect(api.post.mock.calls.map((call) => call[1].events.length)).toEqual([500, 2]);
    expect(checkpoint()).toEqual(events.slice(0, 500).map((item) => item.id));
    expect(progress.syncStatus()).toBe('offline');
    fail = false;
    await progress.flush();
    expect(api.post.mock.calls[2][1].events.map((item) => item.id)).toEqual(['event-500', 'event-501']);
    expect(checkpoint()).toHaveLength(502);
    expect(progress.syncStatus()).toBe('synced');
  });

  it('skips an oversized stored event while uploading its valid neighbors', async () => {
    const oversized = { ...settingsEvent('large'), retainedPayload: 'x'.repeat(262_144) };
    localStorage.setItem(EVENTS_KEY, JSON.stringify([settingsEvent('before'), oversized, settingsEvent('after')]));
    const { progress, api } = setup();
    await progress.init();
    await progress.resync();
    expect(api.post.mock.calls.map((call) => call[1].events.map((item) => item.id))).toEqual([['before', 'after']]);
    expect(checkpoint()).toEqual(['before', 'after']);
    expect(progress.pendingSync()).toEqual({ future: 0, oversized: 1 });
    expect(progress.syncStatus()).toBe('pending');
    expect(JSON.parse(localStorage.getItem(EVENTS_KEY)!).find((item: StoredEvent) => item.id === 'large')).toEqual(oversized);
  });

  it('reconciles legacy checkpoints without discarding historical event formats', async () => {
    const legacy = { id: 'old-review', at, type: 'drill.reviewed', cardId: 'card', grade: 4, durationMs: 10 };
    localStorage.setItem(EVENTS_KEY, JSON.stringify([legacy, settingsEvent('lost')]));
    localStorage.setItem('CapacitorStorage.grasp.synced', JSON.stringify(['old-review', 'lost']));
    const { progress, api } = setup();
    await progress.init();
    await progress.resync();
    expect(api.post.mock.calls[0][1].events).toEqual([legacy, settingsEvent('lost')]);
    expect(checkpoint()).toEqual(['old-review', 'lost']);
  });

  it('persists a pull-only checkpoint and does not resend it after a reload with a failed pull', async () => {
    const { progress, api } = setup({ get: async () => ({ events: [settingsEvent('remote')] }) });
    await progress.resync();
    expect(api.post).not.toHaveBeenCalled();
    expect(checkpoint()).toEqual(['remote']);
    expect(JSON.parse(localStorage.getItem(EVENTS_KEY)!)).toEqual([settingsEvent('remote')]);
    TestBed.resetTestingModule();
    const reload = setup({
      get: async () => {
        throw new Error('unavailable');
      },
    });
    await reload.progress.init();
    await reload.progress.resync();
    expect(reload.api.post).not.toHaveBeenCalled();
    expect(reload.progress.syncStatus()).toBe('offline');
  });

  it('coalesces flush, debounce and resync without overlapping posts or blocking a flush on the pull', async () => {
    vi.useFakeTimers();
    const posted = gate<void>();
    const finishPost = gate<void>();
    const finishPull = gate<{ events: StoredEvent[] }>();
    const { progress, api } = setup({
      get: () => finishPull.promise,
      post: async (events) => {
        posted.resolve();
        await finishPost.promise;
        return acknowledgement(events);
      },
    });
    await progress.record(settingsEvent('one'));
    const pulling = progress.resync();
    const flushing = progress.flush();
    await posted.promise;
    await progress.record(settingsEvent('two'));
    const secondFlush = progress.flush();
    expect(progress.resync()).toBe(pulling);
    await vi.advanceTimersByTimeAsync(1500);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledTimes(1);
    finishPost.resolve();
    await Promise.all([flushing, secondFlush]);
    expect(api.post.mock.calls.map((call) => call[1].events.map((item) => item.id))).toEqual([['one'], ['two']]);
    expect(progress.syncStatus()).toBe('syncing');
    finishPull.resolve({ events: [] });
    await pulling;
    expect(progress.syncStatus()).toBe('synced');
  });

  it('includes an event recorded while its final checkpoint is being saved in the shared flush', async () => {
    const saving = gate<void>();
    const finishSave = gate<void>();
    const set = vi.mocked(Preferences.set);
    set.mockImplementationOnce(async ({ key, value }) => localStorage.setItem(`CapacitorStorage.${key}`, value));
    set.mockImplementationOnce(async ({ key, value }) => {
      saving.resolve();
      await finishSave.promise;
      localStorage.setItem(`CapacitorStorage.${key}`, value);
    });
    const { progress, api } = setup();
    await progress.record(settingsEvent('one'));
    const first = progress.flush();
    await saving.promise;
    const recording = progress.record(settingsEvent('two'));
    const second = progress.flush();
    finishSave.resolve();
    await Promise.all([first, second, recording]);
    expect(api.post.mock.calls.map((call) => call[1].events.map((item) => item.id))).toEqual([['one'], ['two']]);
    expect(checkpoint()).toEqual(['one', 'two']);
  });

  it('preserves queued local storage and proven checkpoints across non-destructive adoption', async () => {
    const writing = gate<void>();
    const release = gate<void>();
    vi.mocked(Preferences.set).mockImplementationOnce(async ({ key, value }) => {
      writing.resolve();
      await release.promise;
      localStorage.setItem(`CapacitorStorage.${key}`, value);
    });
    const { progress } = setup();
    const first = progress.record(settingsEvent('one'));
    await writing.promise;
    const second = progress.record(settingsEvent('two'));
    const flush = progress.flush();
    await vi.waitFor(() => expect(progress.syncStatus()).toBe('syncing'));
    progress.invalidateSync();
    release.resolve();
    await Promise.all([first, second, flush]);
    expect(JSON.parse(localStorage.getItem(EVENTS_KEY)!).map((item: StoredEvent) => item.id)).toEqual(['one', 'two']);
    await progress.resync();
    expect(checkpoint()).toEqual(['one', 'two']);
  });

  it('allows a replacement scope to finish before an ignored old response settles', async () => {
    const oldResponse = gate<unknown>();
    const started = gate<void>();
    const { progress, api, learner } = setup({
      post: async (events) => {
        if (api.post.mock.calls.length === 1) {
          started.resolve();
          return oldResponse.promise;
        }
        return acknowledgement(events);
      },
    });
    await progress.record(settingsEvent('one'));
    const old = progress.flush();
    await started.promise;
    const oldSignal = (api.post.mock.calls[0] as unknown as [unknown, unknown, unknown, AbortSignal])[3];
    progress.invalidateSync();
    learner.value = 'learner-two';
    await progress.resync();
    expect(oldSignal.aborted).toBe(true);
    expect(progress.syncStatus()).toBe('synced');
    oldResponse.reject(new Error('old unavailable response'));
    await old;
    expect(progress.syncStatus()).toBe('synced');
    expect(checkpoint()).toEqual(['one']);
  });

  it('keeps new progress after a clear with delayed storage and ignores the old checkpoint', async () => {
    const writing = gate<void>();
    const release = gate<void>();
    vi.mocked(Preferences.set).mockImplementationOnce(async ({ key, value }) => {
      writing.resolve();
      await release.promise;
      localStorage.setItem(`CapacitorStorage.${key}`, value);
    });
    const { progress } = setup();
    const oldRecord = progress.record(settingsEvent('old'));
    await writing.promise;
    const clearing = progress.clearLocal();
    const newRecord = progress.record(settingsEvent('new'));
    const uploading = progress.flush();
    release.resolve();
    await Promise.all([oldRecord, clearing, newRecord, uploading]);
    expect(JSON.parse(localStorage.getItem(EVENTS_KEY)!).map((item: StoredEvent) => item.id)).toEqual(['new']);
    expect(checkpoint()).toEqual(['new']);
    expect(progress.syncStatus()).toBe('synced');
  });

  it('does not install a delayed initial read after clear', async () => {
    const read = gate<{ value: string | null }>();
    vi.mocked(Preferences.get).mockImplementationOnce(() => read.promise);
    const { progress, api } = setup();
    const init = progress.init();
    await progress.clearLocal();
    await progress.record(settingsEvent('new'));
    read.resolve({ value: JSON.stringify([settingsEvent('old')]) });
    await init;
    await progress.flush();
    expect(api.post.mock.calls[0][1].events.map((item) => item.id)).toEqual(['new']);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('detaches caller-owned nested event data before local persistence and upload', async () => {
    const { progress, api } = setup();
    const input = { type: 'settings.changed' as const, settings: { newPerDay: 5 }, id: 'one', at };
    const recording = progress.record(input);
    input.settings.newPerDay = 9;
    await recording;
    await progress.flush();
    expect(api.post.mock.calls[0][1].events).toEqual([settingsEvent('one')]);
    expect(progress.settings().newPerDay).toBe(5);
  });
  it('preserves stored history when adoption changes identity during the initial read', async () => {
    const read = gate<{ value: string | null }>();
    vi.mocked(Preferences.get).mockImplementationOnce(() => read.promise);
    const { progress, api, learner } = setup();
    const init = progress.init();
    progress.invalidateSync();
    learner.value = 'account-learner';
    const accountSync = progress.resync();
    const recording = progress.record(settingsEvent('during-read'));
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    read.resolve({ value: JSON.stringify([settingsEvent('stored')]) });
    await Promise.all([init, accountSync, recording]);
    await progress.flush();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls.flatMap((call) => call[1].events.map((item) => item.id))).toEqual(['stored', 'during-read']);
    expect(JSON.parse(localStorage.getItem(EVENTS_KEY)!).map((item: StoredEvent) => item.id)).toEqual(['stored', 'during-read']);
    expect(checkpoint()).toEqual(['stored', 'during-read']);
    expect(progress.syncStatus()).toBe('synced');
  });

  it.each([429, 503])('retains all joined work after a %s failure without starting a retry loop', async (status) => {
    vi.useFakeTimers();
    const started = gate<void>();
    const response = gate<unknown>();
    let failure = true;
    const { progress, api } = setup({
      post: async (events) => {
        if (failure) {
          started.resolve();
          return response.promise;
        }
        return acknowledgement(events);
      },
    });
    await progress.record(settingsEvent('one'));
    const first = progress.flush();
    await started.promise;
    await progress.record(settingsEvent('two'));
    const joined = progress.flush();
    response.reject(new ApiError(status, 'Unavailable'));
    await Promise.all([first, joined]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(checkpoint()).toEqual([]);
    expect(progress.syncStatus()).toBe('offline');
    expect(JSON.parse(localStorage.getItem(EVENTS_KEY)!).map((item: StoredEvent) => item.id)).toEqual(['one', 'two']);
    failure = false;
    await progress.flush();
    expect(api.post.mock.calls[1][1].events.map((item) => item.id)).toEqual(['one', 'two']);
    expect(progress.syncStatus()).toBe('synced');
  });

  it('does not start synchronization when its initial storage read fails', async () => {
    vi.mocked(Preferences.get).mockRejectedValueOnce(new Error('Storage unavailable'));
    const { progress, api } = setup();
    await expect(progress.init()).rejects.toThrow('Storage unavailable');
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('finishes an already queued local save without scheduling network work after destruction', async () => {
    vi.useFakeTimers();
    const started = gate<void>();
    const save = gate<void>();
    vi.mocked(Preferences.set).mockImplementationOnce(async ({ key, value }) => {
      started.resolve();
      await save.promise;
      localStorage.setItem(`CapacitorStorage.${key}`, value);
    });
    const { progress, api } = setup();
    const recording = progress.record(settingsEvent('saved'));
    await started.promise;
    TestBed.resetTestingModule();
    save.resolve();
    await recording;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(EVENTS_KEY)!)).toEqual([settingsEvent('saved')]);
  });
});
