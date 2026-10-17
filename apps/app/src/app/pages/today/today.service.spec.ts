import { TestBed } from '@angular/core/testing';
import { TodayService, SHORT_DAY, dayLabel } from './today.service';

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: localStorage.getItem(`CapacitorStorage.${key}`) })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => localStorage.setItem(`CapacitorStorage.${key}`, value)),
    remove: vi.fn(async ({ key }: { key: string }) => localStorage.removeItem(`CapacitorStorage.${key}`)),
  },
}));

describe('TodayService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('keeps "Not today" ids for the day they were hidden on only, on this device', async () => {
    const today = TestBed.inject(TodayService);
    await today.hide('2026-10-14', 'pattern:hashing');
    await today.hide('2026-10-14', 'plan:story:ownership');
    expect([...today.hiddenOn('2026-10-14')]).toEqual(['pattern:hashing', 'plan:story:ownership']);
    expect(today.hiddenOn('2026-10-15').size).toBe(0);

    TestBed.resetTestingModule();
    const reloaded = TestBed.inject(TodayService);
    await reloaded.init();
    expect([...reloaded.hiddenOn('2026-10-14')]).toEqual(['pattern:hashing', 'plan:story:ownership']);
    await reloaded.hide('2026-10-15', 'topic:sd-caching');
    expect([...reloaded.hiddenOn('2026-10-15')]).toEqual(['topic:sd-caching']);
    expect(reloaded.hiddenOn('2026-10-14').size).toBe(0);
  });

  it('remembers until when the first-run card rests, and ignores a stored value it cannot read', async () => {
    localStorage.setItem('CapacitorStorage.grasp.notToday', '{not json');
    const today = TestBed.inject(TodayService);
    await today.hideLoopCard('2026-10-21');
    TestBed.resetTestingModule();
    const reloaded = TestBed.inject(TodayService);
    await reloaded.init();
    expect(reloaded.loopCardHiddenUntil()).toBe('2026-10-21');
    expect(reloaded.hiddenOn('2026-10-14').size).toBe(0);
  });

  it('closing the loop card ends editing, asks Up next to rebuild and hands Today the message', () => {
    const today = TestBed.inject(TodayService);
    today.editing.set(true);
    const visit = today.visit();
    today.close('Loop saved.');
    expect(today.editing()).toBe(false);
    expect(today.visit()).toBe(visit + 1);
    expect(today.closed()).toEqual({ message: 'Loop saved.', place: 'today' });

    today.editing.set(true);
    today.close('Loop updated.', 'settings');
    expect(today.editing(), 'Settings closes its own card, not Today’s').toBe(true);
    expect(today.closed()).toEqual({ message: 'Loop updated.', place: 'settings' });
  });
});

describe('dayLabel', () => {
  it('labels a calendar day as that day in every time zone', () => {
    expect(dayLabel('2026-10-25', SHORT_DAY, 'en-US')).toBe('Oct 25');
    expect(dayLabel('2026-01-01', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }, 'en-US')).toBe(
      'Thursday, January 1, 2026',
    );
  });
});
