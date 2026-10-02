import { ApplicationRef, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CACHE_STOPS, DETECT_STOPS, distributionCheckpoint, getCaseStudy, rolloutCheckpoint } from '@grasp/engine';
import { CaseStageComponent } from '../case-stage.component';
import { ArtifactDistributionWidgetComponent } from './artifact-distribution-widget.component';
import { RolloutPlanWidgetComponent } from './rollout-plan-widget.component';

function mount<T>(component: Type<T>) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const click = (text: string) => {
    const button = [...el.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((b) => b.textContent!.trim() === text);
    if (!button) throw new Error(`No radio reading ${text}`);
    button.click();
    fixture.detectChanges();
  };
  const readout = (name: string) =>
    [...el.querySelectorAll('.readouts div')]
      .find((d) => d.querySelector('dt')!.textContent!.trim() === name)
      ?.querySelector('dd')!
      .textContent!.trim();
  const answer = (index: number) => {
    el.querySelectorAll<HTMLButtonElement>('app-widget-check fieldset button')[index].click();
    fixture.detectChanges();
  };
  const slider = (i: number) => el.querySelectorAll<HTMLInputElement>('input[type="range"]')[i];
  const slide = (i: number, value: number) => {
    const input = slider(i);
    input.value = String(value);
    input.dispatchEvent(new Event('input'));
    TestBed.inject(ApplicationRef).tick();
  };
  return { fixture, el, click, readout, answer, slider, slide, widget: fixture.componentInstance };
}

const marks = (el: HTMLElement) => [...el.querySelectorAll('.g-answer-mark')].map((m) => m.getAttribute('aria-label'));
const legend = (el: HTMLElement) => [...el.querySelectorAll('.legend-list li')].map((li) => li.textContent!.trim().replace(/\s+/g, ' '));
const DETECT = 6;

describe('rollout plan widget', () => {
  it('shows the plan, hides the timeline and the outcome until the prediction is answered, then shows what the model gives', () => {
    const { el, readout, answer, widget } = mount(RolloutPlanWidgetComponent);
    expect(el.querySelector('.plan')!.textContent!.trim()).toBe('Canary 20, then 495, 495, 495, 495 hosts; 100 at a time.');
    expect(el.querySelector('svg.chart')).toBeNull();
    expect(el.querySelector('.readouts')).toBeNull();
    const check = rolloutCheckpoint(widget.settings());
    expect(check.prompt).toContain('How many hosts have received it by then?');
    expect(check.choices[check.answer]).toBe('20 hosts');
    answer(check.answer);
    expect(marks(el)).toEqual(['your answer, correct']);
    expect(readout('Rollout takes')).toBe('3 h 45 min');
    expect(readout('Most capacity out')).toBe('5%');
    expect(readout('Alarm at')).toBe('25 min');
    expect(readout('Bad build reached')).toBe('20 hosts, 1%');
    expect(el.querySelector('svg.chart')!.getAttribute('aria-label')).toBe(
      'Hosts on the new build over 3 h 45 min: the alarm at 25 min, when the bad build has reached 20 hosts',
    );
    expect(el.querySelector('path.hosts')!.getAttribute('d')!.match(/V/g)).toHaveLength(21);
    expect(legend(el)).toEqual([
      'Hosts on the new build as planned, up to 2,000 (solid line)',
      'Alarm (dashed line): no batch starts from here',
      'Reached by the bad build (circle)',
    ]);
  });

  it('keeps the answer while the sliders move, and asks again for a different wave shape', () => {
    const { el, click, readout, answer, slide, widget } = mount(RolloutPlanWidgetComponent);
    const asked = widget.check();
    answer(asked.answer);
    slide(DETECT, DETECT_STOPS.indexOf(45));
    expect(widget.chosen()).toBe(asked.answer);
    expect(widget.shownCheck()).toBe(asked);
    expect(readout('Bad build reached')).toBe('320 hosts, 16%');
    expect(el.querySelector('.readouts .bad')).not.toBeNull();
    click('Each wave doubles');
    expect(widget.chosen()).toBeNull();
    expect(el.querySelector('.readouts')).toBeNull();
    expect(el.querySelector('.plan')!.textContent!.trim()).toBe('Canary 20, then 132, 264, 528, 1,056 hosts; 100 at a time.');
    answer(widget.check().answer);
    expect(readout('Rollout takes')).toBe('3 h 55 min');
  });

  it('draws the alarm past the end when the rollout finishes first', () => {
    const { el, answer, slide, widget } = mount(RolloutPlanWidgetComponent);
    slide(3, 0);
    slide(4, 5);
    slide(DETECT, DETECT_STOPS.length - 1);
    answer(widget.check().answer);
    expect(widget.run().exposed).toBe(2_000);
    expect(el.querySelector('.axis-labels')!.textContent).toContain('2 h 5 min');
    expect(Number(el.querySelector('circle.exposed')!.getAttribute('cx'))).toBeCloseTo(292, 1);
  });

  it('speaks units on its sliders, keeps the drawing out of live regions, and announces once input settles', async () => {
    vi.useFakeTimers();
    try {
      const { el, fixture, slide, slider } = mount(RolloutPlanWidgetComponent);
      expect([0, 1, 2, 3, 4, 5, 6].map((i) => slider(i).getAttribute('aria-valuetext'))).toEqual([
        '2,000 hosts',
        '1 percent of hosts',
        '4 waves',
        '30 minutes',
        '5 percent of hosts',
        '5 minutes',
        '20 minutes',
      ]);
      expect(el.querySelector('[aria-live]')).toBeNull();
      const status = el.querySelector('[role="status"]')!;
      await vi.advanceTimersByTimeAsync(700);
      fixture.detectChanges();
      expect(status.textContent!.trim()).toBe('');
      slide(3, 1);
      slide(3, 0);
      fixture.detectChanges();
      expect(slider(3).getAttribute('aria-valuetext')).toBe('no bake');
      await vi.advanceTimersByTimeAsync(700);
      fixture.detectChanges();
      expect(status.textContent!.trim()).toBe(
        '2,000 hosts, a 1% canary, 4 equal waves, no bakes, 5% at a time, 5 minutes a batch, alarm after 20 minutes. Answer the prediction to see the rollout.',
      );
      expect(el.querySelector('[role="status"]')).toBe(status);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('artifact distribution widget', () => {
  it('hides the time, the bytes and the bottleneck until answered, then shows what the model gives', () => {
    const { el, readout, answer, widget } = mount(ArtifactDistributionWidgetComponent);
    expect(readout('Each host gets')).toBe('500 MB');
    expect(readout('Every host has it')).toBeUndefined();
    expect(el.querySelector('.tiers')).toBeNull();
    const check = distributionCheckpoint(widget.settings());
    expect(check.choices[check.answer]).toBe('13 min 20 s');
    answer(check.answer);
    expect(marks(el)).toEqual(['your answer, correct']);
    expect(readout('Every host has it')).toBe('13 min 20 s');
    expect(readout('Leaves the origin')).toBe('2.5 GB');
    expect(readout('Reaches hosts in all')).toBe('10 TB');
    expect([...el.querySelectorAll('.tier .name')].map((n) => n.textContent!.trim())).toEqual([
      "Origin's uplink",
      "Regional caches' links, bottleneck",
      "Hosts' own links",
    ]);
    expect(el.querySelectorAll('.bar.slowest')).toHaveLength(1);
    expect(el.querySelectorAll('.bar.thin:not(.slowest)')).toHaveLength(2);
    expect(el.querySelector('.tiers')!.getAttribute('aria-label')).toBe(
      "Time each tier needs: the origin's uplink 2 s, the regional caches' links 13 min 20 s, the hosts' own links 4 s; the bottleneck is the regional caches' links",
    );
    expect(legend(el)).toEqual(['Bottleneck (solid bar)', 'Other tiers (outlined bar)']);
  });

  it('keeps the answer while the sliders move, leaves out missing tiers, and asks again when peers or the delta change', () => {
    const { el, click, readout, answer, slide, widget } = mount(ArtifactDistributionWidgetComponent);
    const asked = widget.check();
    answer(asked.answer);
    slide(3, CACHE_STOPS.indexOf(0));
    expect(widget.shownCheck()).toBe(asked);
    expect(readout('Every host has it')).toBe('2 h 13 min');
    expect(readout('Leaves the origin')).toBe('10 TB');
    expect(el.querySelectorAll('.tier')).toHaveLength(2);
    click('Peer to peer');
    expect(widget.chosen()).toBeNull();
    expect(readout('Every host has it')).toBeUndefined();
    answer(widget.check().answer);
    expect(readout('Every host has it')).toBe('4 s');
    expect(readout('Leaves the origin')).toBe('500 MB');
    click('A delta');
    expect(widget.chosen()).toBeNull();
    answer(widget.check().answer);
    expect(readout('Every host has it')).toBe('0.4 s');
  });

  it('speaks units on its sliders and announces one summary once input settles', async () => {
    vi.useFakeTimers();
    try {
      const { el, fixture, slide, slider } = mount(ArtifactDistributionWidgetComponent);
      expect([0, 1, 2, 3].map((i) => slider(i).getAttribute('aria-valuetext'))).toEqual([
        '500 megabytes',
        '20,000 hosts',
        '10 gigabits a second',
        '5 caches',
      ]);
      expect(el.querySelector('[aria-live]')).toBeNull();
      const status = el.querySelector('[role="status"]')!;
      await vi.advanceTimersByTimeAsync(700);
      fixture.detectChanges();
      expect(status.textContent!.trim()).toBe('');
      slide(3, 0);
      await vi.advanceTimersByTimeAsync(700);
      fixture.detectChanges();
      expect(status.textContent!.trim()).toBe(
        '500 megabytes to 20,000 hosts, origin 10 gigabits a second, no caches, each host on its own. Answer the prediction to see the time.',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a deployment stage with a widget', () => {
  it('opens the distribution model only after the decision is answered', async () => {
    const stage = getCaseStudy('code-deployment')!.stages.find((s) => s.widget === 'artifact-distribution')!;
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(CaseStageComponent);
    fixture.componentRef.setInput('stage', stage);
    fixture.componentRef.setInput('caseId', 'code-deployment');
    fixture.componentRef.setInput('orderSeed', 'code-deployment:attempt-1:7');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-artifact-distribution-widget')).toBeNull();
    el.querySelector<HTMLButtonElement>('fieldset button')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('section.widget h3')!.textContent).toBe('Try it: get a release to every server');
    expect(el.querySelector('app-artifact-distribution-widget')).not.toBeNull();
  });
});
