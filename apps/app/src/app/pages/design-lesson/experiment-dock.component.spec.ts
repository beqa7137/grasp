import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CACHE_EXPERIMENTS, renderExperiment, type SdExperiment } from '@grasp/engine';
import { ExperimentDockComponent, type ExperimentPhase } from './experiment-dock.component';

const SHOWN = CACHE_EXPERIMENTS.map(renderExperiment);

@Component({
  imports: [ExperimentDockComponent],
  template: `
    <app-experiment-dock
      [experiments]="experiments"
      [active]="active()"
      [phase]="phase()"
      [done]="done()"
      [(chosen)]="chosen"
      (start)="active.set($event)"
    />
  `,
})
class Host {
  readonly experiments = SHOWN;
  readonly active = signal<SdExperiment | null>(null);
  readonly phase = signal<ExperimentPhase>('asking');
  readonly done = signal<ReadonlySet<string>>(new Set());
  readonly chosen = signal<number | null>(null);
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const text = (selector: string) => [...el.querySelectorAll(selector)].map((t) => t.textContent!.replace(/\s+/g, ' ').trim());
  return { fixture, el, text, host: fixture.componentInstance };
}

describe('ExperimentDockComponent', () => {
  it('lists every experiment as a card, the challenge with a flag, and starts one on a tap', () => {
    const { fixture, el, text, host } = setup();
    expect(text('.card .title')).toEqual(SHOWN.map((e) => e.title));
    expect(el.querySelectorAll('.card ion-icon[name="flag-outline"]')).toHaveLength(1);
    expect(el.querySelector('.dock')).toBeNull();
    el.querySelectorAll<HTMLButtonElement>('.card')[1].click();
    fixture.detectChanges();
    expect(host.active()?.id).toBe('p99-miss');
    expect(el.querySelectorAll('.card')[1].getAttribute('aria-current')).toBe('step');
    expect(text('.dock legend')).toEqual([SHOWN[1].ask]);
  });

  it('keeps the choice as a guess while the widget plays, then marks it and reveals the numbers politely', () => {
    const { fixture, el, text, host } = setup();
    host.active.set(SHOWN[1]);
    fixture.detectChanges();
    el.querySelectorAll<HTMLButtonElement>('fieldset button')[0].click();
    host.phase.set('playing');
    fixture.detectChanges();
    expect(host.chosen()).toBe(0);
    expect(text('.guess .you')).toEqual(['your guess']);
    expect(el.querySelector('.g-answer-mark')).toBeNull();
    const live = el.querySelector('[aria-live="polite"]')!;
    expect(live.textContent).toContain('Watch the picture');
    host.phase.set('revealed');
    host.done.set(new Set(['p99-miss']));
    fixture.detectChanges();
    expect(el.querySelector('[aria-live="polite"]')).toBe(live);
    expect(live.textContent).toContain(SHOWN[1].reveal);
    expect([...el.querySelectorAll('.g-answer-mark')].map((m) => m.getAttribute('aria-label'))).toEqual([
      'your answer, wrong',
      'correct answer',
    ]);
    expect(el.querySelectorAll('.card .done')).toHaveLength(1);
  });
});
