import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { REPLICA_EXPERIMENTS, renderExperiment } from '@grasp/engine';
import { ReplicaWidgetComponent } from './replica-widget.component';

@Component({
  imports: [ReplicaWidgetComponent],
  template: `<app-replica-widget [experiments]="experiments" />`,
})
class Host {
  readonly experiments = REPLICA_EXPERIMENTS;
}

const SHOWN = REPLICA_EXPERIMENTS.map(renderExperiment);
const SOON = SHOWN.findIndex((e) => e.id === 'too-soon');
const GOAL = SHOWN.findIndex((e) => e.goal);

function setup({ width = 694, motion = false } = {}) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly report: ResizeObserverCallback) {}
      observe() {
        this.report([{ contentRect: { width: width + 2 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  const animate = vi.fn(() => ({ pause: vi.fn(), play: vi.fn(), cancel: vi.fn() }) as unknown as Animation);
  Element.prototype.animate = animate;
  Element.prototype.scrollIntoView = vi.fn();
  if (motion) document.documentElement.removeAttribute('data-motion');
  else document.documentElement.setAttribute('data-motion', 'off');
  const fixture = TestBed.createComponent(Host);
  const render = () => {
    TestBed.tick();
    fixture.detectChanges();
  };
  render();
  render();
  const el = fixture.nativeElement as HTMLElement;
  const text = (selector: string) => [...el.querySelectorAll(selector)].map((t) => t.textContent!.replace(/\s+/g, ' ').trim());
  const slider = (name: string) => el.querySelector<HTMLElement>(`[role="slider"][aria-label="${name}"]`)!;
  const key = (name: string, k: string, times = 1) => {
    for (let i = 0; i < times; i++) slider(name).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    render();
  };
  const press = (name: string) => {
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === name)!.click();
    render();
  };
  const card = (i: number) => {
    el.querySelectorAll<HTMLButtonElement>('.cards button')[i].click();
    render();
  };
  const toggle = () => {
    el.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    render();
  };
  const stageHeight = () => el.querySelector<HTMLElement>('g-stage .well')!.style.height;
  return { el, text, slider, key, press, card, toggle, stageHeight, animate };
}

describe('ReplicaWidgetComponent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-motion');
  });

  it('numbers the write, the replica applying it and the read, and says what the read returns', () => {
    const { text, el } = setup();
    expect(text('.event .num')).toEqual(['1', '2', '3', '4']);
    expect(text('.event-label')).toEqual(['write', 'applies it, 800 ms', 'read, 300 ms', 'old value']);
    expect(text('.value')).toEqual(['the old value']);
    expect(text('.caption')).toEqual(['from the replica, which applies it at 800 ms', 'Your reads every 250 ms (dots): 4 of 13 stale']);
    expect(el.querySelectorAll('circle.mark.critical')).toHaveLength(4);
    expect(el.querySelectorAll('circle.mark')).toHaveLength(13);
  });

  it('moves the read past the lag by its handle, and pins it to the primary with read your own writes', () => {
    const { key, text, toggle, slider } = setup();
    key('Your read', 'ArrowRight', 5);
    expect(text('.value')).toEqual(['the new value']);
    key('Your read', 'ArrowLeft', 5);
    toggle();
    expect(text('.value')).toEqual(['the new value']);
    expect(text('.caption')[0]).toBe('from the primary, which has every write');
    expect(slider('End of the pin to the primary').getAttribute('aria-valuenow')).toBe('1000');
    key('Replica applies the write', 'ArrowRight', 12);
    key('Your read', 'ArrowRight', 9);
    expect(text('.value')).toEqual(['the old value']);
    expect(text('g-timeline .legend li')).toContain('a read here is stale');
  });

  it('hides the answer while an experiment waits for your guess, then reveals the model answer', () => {
    const { press, card, text, el, stageHeight } = setup();
    const height = stageHeight();
    card(SOON);
    expect(text('.value')).toEqual(['?']);
    // The replica's side would give the answer away: its spans, when it applies the write, and the stream of reads.
    expect(text('.event .num')).toEqual(['1', '3']);
    expect(el.querySelectorAll('circle.mark')).toHaveLength(0);
    expect(el.querySelector('g-timeline rect.span.muted')).toBeNull();
    expect(text('g-timeline .legend li')).not.toContain('a read here is stale');
    press(SHOWN[SOON].choices[SHOWN[SOON].answer]);
    expect(text('app-widget-check .explain')).toEqual([SHOWN[SOON].reveal]);
    expect(text('.value')).toEqual(['the old value']);
    for (const region of SHOWN[SOON].focus) expect(el.querySelector(`[data-focus="${region}"]`)!.classList).toContain('focused');
    expect(stageHeight()).toBe(height);
  });

  it('meets the challenge once the pin outlasts the lag', () => {
    const { card, key, text } = setup();
    card(GOAL);
    expect(text('.status')[0]).toBe('Your reads are stale for 1 s after the pin; the goal is never.');
    key('End of the pin to the primary', 'ArrowRight', 2);
    expect(text('.status')[0]).toBe('Goal met: none of your reads can be stale, with a pin of 2 s.');
    expect(text('.reveal')).toEqual([SHOWN[GOAL].reveal]);
    key('End of the pin to the primary', 'ArrowLeft', 2);
    expect(text('.status')[0]).toBe('You met it with a pin of 2 s; now your reads are stale for 1 s.');
  });

  it('reveals what the picture shows even when a handle moved while the question was open, and clears the outline on free play', () => {
    const { press, card, text, key, el } = setup();
    card(SOON);
    key('Your read', 'ArrowRight', 9);
    press(SHOWN[SOON].choices[SHOWN[SOON].answer]);
    expect(text('.value')).toEqual(['the old value']);
    expect(text('app-widget-check .explain')).toEqual([SHOWN[SOON].reveal]);
    expect(el.querySelectorAll('.focused')).not.toHaveLength(0);
    key('Your read', 'ArrowRight');
    expect(el.querySelectorAll('.focused')).toHaveLength(0);
  });

  it('plays the 3 s after the write with motion, and an answer during it reveals when interrupted', () => {
    const { press, card, text, slider, key } = setup({ motion: true });
    card(SOON);
    press(SHOWN[SOON].choices[0]);
    expect(text('app-widget-check .explain')).toEqual(['Watch the picture: the answer plays out on it.']);
    expect(slider('Your read').getAttribute('aria-disabled')).toBe('true');
    expect(text('.event .num')).toEqual(['1']);
    card(SOON);
    expect(text('app-widget-check legend')).toEqual([SHOWN[SOON].ask]);
    key('Your read', 'ArrowRight');
    expect(text('.event .num')).toEqual(['1', '3']);
  });
});
