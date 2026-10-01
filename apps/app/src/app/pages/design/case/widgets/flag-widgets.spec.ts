import { ApplicationRef, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { bucketingCheckpoint, bucketingRun, bytesRate, getCaseStudy, propagation, propagationCheckpoint, secondsText } from '@grasp/engine';
import { CaseStageComponent } from '../case-stage.component';
import { BucketingWidgetComponent } from './bucketing-widget.component';
import { PropagationWidgetComponent } from './propagation-widget.component';

function mount<T>(component: Type<T>) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const click = (selector: string, text: string) => {
    const button = [...el.querySelectorAll<HTMLButtonElement>(selector)].find((b) => b.textContent!.trim() === text);
    if (!button) throw new Error(`No ${selector} reading ${text}`);
    button.click();
    fixture.detectChanges();
  };
  const readout = (name: string) =>
    [...el.querySelectorAll('.readouts div')]
      .find((d) => d.querySelector('dt')!.textContent!.trim() === name)
      ?.querySelector('dd')!
      .textContent!.trim();
  const answerRight = (answer: number) => {
    el.querySelectorAll<HTMLButtonElement>('app-widget-check fieldset button')[answer].click();
    fixture.detectChanges();
  };
  return { fixture, el, click, readout, answerRight, widget: fixture.componentInstance };
}

const marks = (el: HTMLElement) => [...el.querySelectorAll('.g-answer-mark')].map((m) => m.getAttribute('aria-label'));

describe('bucketing widget', () => {
  it('hides the overlap until the prediction is answered, then shows the counts the model gives', () => {
    const { el, readout, answerRight, widget } = mount(BucketingWidgetComponent);
    const run = bucketingRun(widget.settings(), null);
    expect(el.querySelectorAll('.grid .cell')).toHaveLength(1_000);
    expect(el.querySelectorAll('.grid .cell.in')).toHaveLength(run.inA);
    expect(readout('In new-checkout')).toBe(String(run.inA));
    expect(readout('Also in search-ranking')).toBeUndefined();
    expect(el.querySelector('.grid .cell.both, .grid .cell.only-b')).toBeNull();
    answerRight(bucketingCheckpoint(widget.settings(), null).answer);
    expect(marks(el)).toEqual(['your answer, correct']);
    expect(readout('Also in search-ranking')).toBe(String(run.both));
    expect(el.querySelectorAll('.grid .cell.only-b')).toHaveLength(run.inB - run.both);
  });

  it('asks again when the rollout grows, and keeps every user who was in', () => {
    const { el, click, readout, answerRight, widget } = mount(BucketingWidgetComponent);
    const before = bucketingRun(widget.settings(), null).inA;
    answerRight(0);
    click('[role="radio"]', '25%');
    expect(widget.chosen()).toBeNull();
    const check = bucketingCheckpoint(widget.settings(), widget.previous());
    expect(check.prompt).toContain('moves from 10% to 25%');
    answerRight(check.answer);
    expect(readout('Stayed')).toBe(String(before));
    expect(readout('Left')).toBe('0');
    expect(el.querySelectorAll('.grid .cell.left')).toHaveLength(0);
  });

  it('reshuffles on a new salt, offers no salt without one, and flickers only under a die per request', () => {
    const { el, click, widget } = mount(BucketingWidgetComponent);
    for (let i = 0; i < 5; i++) click('button', 'Change the salt');
    expect(el.textContent).toContain('new-checkout/6');
    expect(widget.previous()).toEqual({ percent: 10, saltVersion: 5 });
    expect(widget.check().prompt).toContain('gets a new salt');
    click('[role="radio"]', 'Random on each request');
    expect(widget.previous()).toBeNull();
    expect(widget.check().prompt).toContain('see both versions');
    expect([...el.querySelectorAll('button')].some((b) => b.textContent!.includes('Change the salt'))).toBe(false);
    click('[role="radio"]', 'Hash of user id only');
    expect(widget.check().prompt).toContain('also in search-ranking');
  });

  it('labels the grid with a summary, keeps it out of live regions, and announces once input settles', async () => {
    vi.useFakeTimers();
    try {
      const { el, click, fixture, widget } = mount(BucketingWidgetComponent);
      const grid = el.querySelector('.grid')!;
      expect(grid.getAttribute('role')).toBe('img');
      expect(grid.getAttribute('aria-label')).toBe(`${widget.run().inA} of 1,000 users in new-checkout at 10%`);
      expect(el.querySelector('[aria-live]')).toBeNull();
      const status = el.querySelector('[role="status"]')!;
      await vi.advanceTimersByTimeAsync(700);
      fixture.detectChanges();
      expect(status.textContent!.trim()).toBe('');
      click('[role="radio"]', '25%');
      click('[role="radio"]', '50%');
      await vi.advanceTimersByTimeAsync(300);
      fixture.detectChanges();
      expect(status.textContent!.trim()).toBe('');
      await vi.advanceTimersByTimeAsync(400);
      fixture.detectChanges();
      expect(status.textContent).toContain(`new-checkout at 50%: ${widget.run().inA} of 1,000 users in.`);
      expect(el.querySelector('[role="status"]')).toBe(status);
    } finally {
      vi.useRealTimers();
    }
  });
  it('marks every grid category with more than hue, and shows the overlap view or the change view', () => {
    const { el, click, answerRight, widget } = mount(BucketingWidgetComponent);
    const legend = () => [...el.querySelectorAll('.legend-list li')].map((li) => li.textContent!.trim());
    answerRight(bucketingCheckpoint(widget.settings(), null).answer);
    expect(legend()).toEqual(['Not in new-checkout', 'In new-checkout', 'In both flags (dot)', 'Only in search-ranking (faint)']);
    expect(el.querySelectorAll('.grid .cell.both')).toHaveLength(widget.run().both);
    click('[role="radio"]', '5%');
    answerRight(widget.check().answer);
    expect(legend()).toEqual(['Not in new-checkout', 'Stayed in', 'Joined (dot)', 'Left (outline)']);
    expect(el.querySelectorAll('.grid .cell.left')).toHaveLength(widget.run().left!);
    expect(el.querySelectorAll('.grid .cell.both')).toHaveLength(0);
    click('[role="radio"]', 'Random on each request');
    answerRight(widget.check().answer);
    expect(legend()).toContain('Saw both versions (half filled)');
  });
});

describe('propagation widget', () => {
  it('hides every readout until the prediction is answered, then shows what the model gives', () => {
    const { el, readout, answerRight, widget } = mount(PropagationWidgetComponent);
    expect(el.querySelector('.readouts')).toBeNull();
    const check = propagationCheckpoint(widget.settings());
    answerRight(check.answer);
    expect(marks(el)).toEqual(['your answer, correct']);
    const run = propagation(widget.settings());
    expect(readout('Last instance has it')).toBe(secondsText(run.worstS));
    expect(readout('Leaving the service')).toBe(bytesRate(run.originBytesS));
    expect(readout('Leaving the service')).toBe('667 MB/s');
    expect(readout('Requests to the service')).toBe('667/s');
  });

  it('switches to streaming without the polling controls, and asks again', () => {
    const { el, click, readout, answerRight, widget } = mount(PropagationWidgetComponent);
    answerRight(0);
    click('[role="radio"]', 'Stream (server-sent events)');
    expect(widget.chosen()).toBeNull();
    expect(el.querySelector('input[type="checkbox"]')).toBeNull();
    expect([...el.querySelectorAll('input[type="range"]')].map((i) => i.getAttribute('aria-valuetext'))).toEqual([
      '20,000 instances',
      '2 changes a minute',
    ]);
    answerRight(propagationCheckpoint(widget.settings()).answer);
    expect(readout('Last instance has it')).toBe('0.7 s');
    expect(readout('Stream servers')).toBe('2');
    click('[role="radio"]', 'Stream (server-sent events)');
    expect(widget.chosen()).not.toBeNull();
  });

  it('keeps the readouts live while sliders move, and asks again only when delivery, payload or the CDN changes', () => {
    const { el, click, readout, answerRight, widget } = mount(PropagationWidgetComponent);
    const asked = widget.check();
    answerRight(asked.answer);
    widget.slide('instances', 40_000);
    widget.slide('intervalS', 60);
    TestBed.inject(ApplicationRef).tick();
    expect(widget.chosen()).toBe(asked.answer);
    expect(widget.shownCheck()).toBe(asked);
    expect(readout('Requests to the service')).toBe('667/s');
    click('[role="radio"]', 'Changes since its version');
    expect(widget.chosen()).toBeNull();
    expect(el.querySelector('.readouts')).toBeNull();
    answerRight(widget.check().answer);
    (el.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    TestBed.inject(ApplicationRef).tick();
    expect(widget.chosen()).toBeNull();
  });

  it('labels its sliders with units and announces one summary once input settles', async () => {
    vi.useFakeTimers();
    try {
      const { el, fixture, widget } = mount(PropagationWidgetComponent);
      expect([...el.querySelectorAll('input[type="range"]')].map((i) => i.getAttribute('aria-valuetext'))).toEqual([
        '20,000 instances',
        '30 seconds',
        '2 changes a minute',
      ]);
      const status = el.querySelector('[role="status"]')!;
      await vi.advanceTimersByTimeAsync(700);
      fixture.detectChanges();
      expect(status.textContent!.trim()).toBe('');
      for (const v of [35, 40, 45, 60]) widget.slide('intervalS', v);
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(700);
      fixture.detectChanges();
      expect(status.textContent!.trim()).toBe(
        'Polling every 60 seconds to 20,000 instances, 2 changes a minute. Answer the prediction to see the results.',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a feature flag stage with a widget', () => {
  it('opens the bucketing model only after the decision is answered', async () => {
    const stage = getCaseStudy('feature-flags')!.stages.find((s) => s.widget === 'bucketing')!;
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(CaseStageComponent);
    fixture.componentRef.setInput('stage', stage);
    fixture.componentRef.setInput('caseId', 'feature-flags');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-bucketing-widget')).toBeNull();
    el.querySelector<HTMLButtonElement>('fieldset button')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('section.widget h3')!.textContent).toBe('Try it: bucket 1,000 users into a rollout');
    expect(el.querySelector('app-bucketing-widget')).not.toBeNull();
  });
});
