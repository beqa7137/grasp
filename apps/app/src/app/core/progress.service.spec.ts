import { TestBed } from '@angular/core/testing';
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
});
