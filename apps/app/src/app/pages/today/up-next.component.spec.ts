import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AnnouncerService } from '../../core/announcer.service';
import { ProgressService } from '../../core/progress.service';
import { StoryBankService } from '../behavioral/story-bank.service';
import { CaseDraftsService } from '../design/case/case-drafts.service';
import { TodayService } from './today.service';
import { UpNextComponent } from './up-next.component';

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async () => ({ value: null })),
    set: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    keys: vi.fn(async () => ({ keys: [] })),
  },
}));

describe('Up next', () => {
  afterEach(() => vi.useRealTimers());

  async function render(before?: () => void) {
    vi.useFakeTimers({ now: new Date('2026-10-14T09:00:00') });
    TestBed.configureTestingModule({
      imports: [UpNextComponent],
      providers: [
        provideRouter([]),
        AnnouncerService,
        {
          provide: ApiService,
          useValue: { get: async () => ({ events: [] }), post: async () => ({ acknowledgedIds: [], deferredFutureIds: [] }) },
        },
        { provide: StoryBankService, useValue: { load: async () => undefined, stories: signal([]) } },
        { provide: CaseDraftsService, useValue: { load: async () => undefined, draft: () => undefined } },
      ],
    });
    before?.();
    const progress = TestBed.inject(ProgressService);
    const fixture = TestBed.createComponent(UpNextComponent);
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    const title = () => (fixture.nativeElement as HTMLElement).querySelector('app-up-next-card h3')?.textContent?.trim();
    return { progress, fixture, title, today: TestBed.inject(TodayService) };
  }

  it('holds its card while events land and the clock ticks, and rebuilds on a new visit or a new day', async () => {
    const { progress, fixture, title, today } = await render();
    const first = title();
    expect(first).toBe('Learn Arrays & Hashing');

    await progress.record({ type: 'target.set', target: { level: 'senior', rounds: { coding: 0, design: 0, behavioral: 1 } } });
    await vi.advanceTimersByTimeAsync(61_000);
    fixture.detectChanges();
    expect(title()).toBe(first);

    progress.now.set(new Date('2026-10-15T09:00:00'));
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(title()).not.toBe(first);

    const second = title();
    today.visit.update((n) => n + 1);
    fixture.detectChanges();
    expect(title()).toBe(second);
  });

  it('waits while Today is out of view', async () => {
    const { fixture, title, today } = await render(() => TestBed.inject(TodayService).shown.set(false));
    expect(title()).toBeUndefined();
    today.shown.set(true);
    fixture.detectChanges();
    expect(title()).toBe('Learn Arrays & Hashing');
  });
});
