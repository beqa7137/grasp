import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { loopReadiness } from '@grasp/engine';
import { ApiService } from '../../core/api.service';
import { ProgressService } from '../../core/progress.service';
import { StoryBankService } from '../behavioral/story-bank.service';
import { TodayAsideComponent } from './today-aside.component';

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async () => ({ value: null })),
    set: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    keys: vi.fn(async () => ({ keys: ['grasp.code.draft.two-sum.python'] })),
  },
}));

describe("Today's aside", () => {
  async function render() {
    TestBed.configureTestingModule({
      imports: [TodayAsideComponent],
      providers: [
        provideRouter([]),
        {
          provide: ApiService,
          useValue: { get: async () => ({ events: [] }), post: async () => ({ acknowledgedIds: [], deferredFutureIds: [] }) },
        },
        { provide: StoryBankService, useValue: { load: async () => undefined, stories: signal([]) } },
      ],
    });
    const progress = TestBed.inject(ProgressService);
    await progress.record({ type: 'target.set', target: { level: 'mid', rounds: { coding: 2, design: 1, behavioral: 1 } } });
    for (const correct of [false, false, true]) {
      await progress.record({ type: 'predict.answered', patternId: 'binary-search', algorithmId: 'binary-search', correct });
    }
    await progress.record({ type: 'code.submitted', problemId: 'koko-bananas', language: 'python', passed: 12, total: 12 });
    const fixture = TestBed.createComponent(TodayAsideComponent);
    // Drafts are read in an effect, once the aside first renders.
    for (let i = 0; i < 3; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
    return { progress, el: fixture.nativeElement as HTMLElement };
  }

  it('shows the ring at the loop’s readiness, each round as a meter, and links Progress in one tap (journey 8)', async () => {
    const { progress, el } = await render();
    const readiness = loopReadiness(progress.state(), [], progress.now());
    const ring = el.querySelector('app-readiness-ring')!;
    expect(ring.getAttribute('role')).toBe('meter');
    expect(Number(ring.getAttribute('aria-valuenow'))).toBe(readiness.score);
    const meters = [...el.querySelectorAll('.rounds [role="meter"]')].map((m) => [
      m.getAttribute('aria-label'),
      Number(m.getAttribute('aria-valuenow')),
    ]);
    expect(meters).toEqual(
      readiness.rounds.map((r) => [
        `${{ coding: 'Coding', design: 'System design', behavioral: 'Behavioral' }[r.round]} readiness`,
        r.score,
      ]),
    );
    expect(el.querySelector('.rounds li')!.textContent).toContain('×2');
    expect(el.querySelector<HTMLAnchorElement>('a.more')!.getAttribute('href')).toBe('/today/progress');
  });

  it('drills the weak spots in one tap and continues this device’s drafts (journeys 5 and 4)', async () => {
    const { el } = await render();
    const drill = [...el.querySelectorAll<HTMLAnchorElement>('a')].find((a) => a.textContent!.startsWith('Drill this'))!;
    expect(drill.getAttribute('href')).toBe('/today/drill?topics=binary-search');
    expect(drill.textContent!.trim()).toMatch(/^Drill this · \d+ cards$/);
    expect(el.textContent).toContain('Missed 2 of 3 predictions');
    const continued = el.querySelector('section[aria-labelledby="continue-heading"]')!;
    expect(continued.textContent).toContain('Two Sum');
    expect(continued.textContent).toContain('on this device');
  });
});
