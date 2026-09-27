import { TestBed } from '@angular/core/testing';
import { ApiError } from './api.service';
import { ApiService } from './api.service';
import { ProgressService } from './progress.service';

describe('ProgressService sync', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('keeps a failed pull visible and clears the failure after a successful retry', async () => {
    let available = false;
    const api = {
      get: vi.fn(async () => {
        if (!available) throw new Error('Database unavailable');
        return { events: [] };
      }),
      post: vi.fn(),
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
    expect(api.get).toHaveBeenCalledWith('/progress/events', 20_000);
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
      post: vi.fn(),
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
      post: vi.fn(),
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    progress = TestBed.inject(ProgressService);

    await progress.resync();

    expect(progress.syncStatus()).toBe('idle');
    expect(api.post).not.toHaveBeenCalled();
  });
});
