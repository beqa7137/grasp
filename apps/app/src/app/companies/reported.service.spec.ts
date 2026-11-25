import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { replay, type TargetInput } from '@grasp/engine';
import { ProgressService } from '../core/progress.service';
import { ReportedService } from './reported.service';

function setup(target: TargetInput | null, day = '2026-11-24') {
  TestBed.resetTestingModule();
  const events = target ? [{ id: 't', at: '2026-11-01T09:00:00.000Z', type: 'target.set' as const, target }] : [];
  const today = signal(day);
  const state = signal(replay(events));
  TestBed.configureTestingModule({
    providers: [{ provide: ProgressService, useValue: { state, day: today } }],
  });
  return { reported: TestBed.inject(ReportedService), today };
}

const rounds = { coding: 2, design: 1, behavioral: 1 };

describe('ReportedService', () => {
  it("names the Target company's reported items on the device's day", async () => {
    const { reported, today } = setup({ level: 'mid', rounds, company: 'microsoft' });
    await reported.ready();
    expect(reported.items()!.company).toBe('microsoft');
    expect(reported.items()!.problems.has('two-sum')).toBe(true);
    expect(reported.items()!.cases.has('chat')).toBe(true);
    expect(reported.problems()['microsoft']!.has('two-sum')).toBe(true);
    // The device's day, not UTC's: a day past every recheck hides them all, as on the item pages.
    today.set('2027-03-05');
    expect(reported.items()!.problems.size).toBe(0);
  });

  it('loads nothing without an offered Target company until a page asks', async () => {
    for (const target of [null, { level: 'mid' as const, rounds, company: 'amazon' as const }]) {
      const { reported } = setup(target);
      await reported.ready();
      expect(reported.company()).toBeNull();
      expect(reported.items()).toBeNull();
      expect(reported.problems()).toEqual({});
      await reported.load();
      expect(reported.problems()['microsoft']!.size).toBeGreaterThan(0);
      expect(reported.items()).toBeNull();
    }
  });
});
