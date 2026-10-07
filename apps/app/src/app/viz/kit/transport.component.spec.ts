import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { haptic } from '../../core/haptics';
import { HOLD_PX, tickX } from './scrub';
import { TransportComponent, stepInterval, type Band, type Speed, type Tick } from './transport.component';

@Component({
  imports: [TransportComponent],
  template: `
    <g-transport
      [index]="index()"
      [count]="count()"
      [ticks]="ticks()"
      [chapters]="chapters()"
      [speed]="speed()"
      [guard]="guard()"
      [asking]="asking()"
      (seek)="index.set($event); log.push('seek ' + $event)"
      (skipTick)="log.push('skip ' + $event)"
      (holdRelease)="log.push('release ' + $event)"
      (nextCheckpoint)="log.push('next')"
      (previousCheckpoint)="log.push('previous')"
      (toResult)="log.push('result')"
      (restart)="log.push('restart')"
      (speedChange)="speed.set($event)"
    />
  `,
})
class Host {
  readonly index = signal(0);
  readonly count = signal(21);
  readonly ticks = signal<Tick[]>([]);
  readonly chapters = signal<Band[]>([]);
  readonly speed = signal<Speed>(1);
  readonly guard = signal(true);
  readonly asking = signal(false);
  readonly log: string[] = [];
}

const WIDTH = 216;

/** Sets up the transport, its tick row measured `trackPx` wide (0: not measured, as while ⋯ is closed). */
function setUp(changes: (host: Host) => void = () => undefined, trackPx = 0) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly report: ResizeObserverCallback) {}
      observe() {
        this.report([{ contentRect: { width: trackPx } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect() {}
    },
  );
  const fixture = TestBed.createComponent(Host);
  changes(fixture.componentInstance);
  fixture.detectChanges();
  const el: HTMLElement = fixture.nativeElement;
  const layer = el.querySelector<HTMLElement>('.drag')!;
  layer.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: WIDTH,
    height: 44,
    right: WIDTH,
    bottom: 44,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  layer.setPointerCapture = () => undefined;
  const pointer = (type: string, x: number, pointerType = 'touch') => {
    layer.dispatchEvent(
      Object.assign(new MouseEvent(type, { clientX: x, bubbles: true, cancelable: true, button: 0 }), { pointerId: 7, pointerType }),
    );
    fixture.detectChanges();
  };
  return { fixture, host: fixture.componentInstance, el, pointer };
}

describe('TransportComponent', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders one count and one Timeline, whatever the layout, with Timeline and Speed labelled where they show', () => {
    const { el } = setUp();
    const named = (selector: string) => el.querySelector('#' + el.querySelector(selector)!.getAttribute('aria-labelledby'))!.textContent;
    expect(named('input[type="range"]')).toBe('Timeline');
    expect(named('[role="radiogroup"]')).toBe('Speed');
    expect(el.querySelectorAll('.count')).toHaveLength(1);
    expect(el.querySelectorAll('input[type="range"]')).toHaveLength(1);
    expect(el.querySelector('.count')!.textContent!.trim()).toBe('1 / 21');
  });

  it('draws a tick per checkpoint in its state, and says it on the Timeline', () => {
    const states: Tick[] = [
      { at: 4, state: 'pending' },
      { at: 8, state: 'right' },
      { at: 12, state: 'missed' },
      { at: 16, state: 'skipped' },
    ];
    const { el, host, fixture } = setUp((h) => h.ticks.set(states));
    expect([...el.querySelectorAll<HTMLElement>('.tick')].map((t) => [t.dataset['state'], t.style.getPropertyValue('--p')])).toEqual([
      ['pending', '0.2'],
      ['right', '0.4'],
      ['missed', '0.6'],
      ['skipped', '0.8'],
    ]);
    const timeline = el.querySelector('input')!;
    const words = [4, 8, 12, 16, 5].map((i) => {
      host.index.set(i);
      fixture.detectChanges();
      return timeline.getAttribute('aria-valuetext');
    });
    expect(words).toEqual([
      'Step 5 of 21, checkpoint',
      'Step 9 of 21, checkpoint, right',
      'Step 13 of 21, checkpoint, missed',
      'Step 17 of 21, checkpoint, skipped',
      'Step 6 of 21',
    ]);
  });

  it('merges ticks drawn too close to show whole into one mark, in the state that most needs the learner', () => {
    const ticks: Tick[] = [
      { at: 2, state: 'right' },
      { at: 3, state: 'pending' },
      { at: 4, state: 'skipped' },
      { at: 6, state: 'missed' },
      { at: 7, state: 'skipped' },
      { at: 12, state: 'right' },
    ];
    const { el, fixture } = setUp((h) => h.ticks.set(ticks), 200);
    fixture.detectChanges();
    const marks = () => [...el.querySelectorAll<HTMLElement>('.tick')].map((t) => [t.dataset['state'], t.style.getPropertyValue('--p')]);
    expect(marks(), '10px a frame: ticks closer than 16px to the last mark merge, and the mark moves to the tick it shows').toEqual([
      ['pending', '0.15'],
      ['missed', '0.3'],
      ['right', '0.6'],
    ]);
    expect(setUp((h) => h.ticks.set(ticks), 0).el.querySelectorAll('.tick'), 'nothing merges before the row is measured').toHaveLength(6);
  });

  it('draws chapter bands only when the run has chapters', () => {
    expect(setUp().el.querySelector('.bands')).toBeNull();
    const { el } = setUp((h) =>
      h.chapters.set([
        { start: 0, end: 9 },
        { start: 10, end: 20 },
      ]),
    );
    expect(
      [...el.querySelectorAll<HTMLElement>('.bands i')].map((b) => [
        b.style.getPropertyValue('--p'),
        b.style.getPropertyValue('--span'),
        b.classList.contains('odd'),
      ]),
    ).toEqual([
      ['0', '0.5', false],
      ['0.5', '0.5', true],
    ]);
  });

  it('offers Next checkpoint only while one lies ahead, and Jump to result until the end', () => {
    const { el, host, fixture } = setUp((h) => h.ticks.set([{ at: 4, state: 'pending' }]));
    const button = (name: string) =>
      [...el.querySelectorAll('button')].filter((b) => b.textContent!.includes(name) || b.getAttribute('aria-label') === name);
    expect(button('Next checkpoint').every((b) => !b.disabled)).toBe(true);
    host.index.set(4);
    fixture.detectChanges();
    expect(button('Next checkpoint').every((b) => b.disabled)).toBe(true);
    host.index.set(20);
    fixture.detectChanges();
    expect(button('Jump to result').every((b) => b.disabled)).toBe(true);
  });

  it('chooses a speed from radios, Instant at 4×’s pace', () => {
    const { el, host, fixture } = setUp();
    const radios = [...el.querySelectorAll<HTMLButtonElement>('[role="radiogroup"] [role="radio"]')];
    expect(radios.map((r) => r.textContent!.trim())).toEqual(['0.5×', '1×', '2×', '4×', 'Instant']);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false', 'false', 'false']);
    radios[4].click();
    fixture.detectChanges();
    expect(host.speed()).toBe('instant');
    expect([0.5, 1, 2, 4, 'instant'].map((s) => stepInterval(s as Speed))).toEqual([2200, 1100, 550, 275, 275]);
  });

  it('holds a touch drag on an unanswered checkpoint, skips it 24px on, and opens the next one it is let go on', () => {
    const { pointer, host } = setUp((h) =>
      h.ticks.set([
        { at: 6, state: 'pending' },
        { at: 12, state: 'pending' },
      ]),
    );
    const calls: string[] = [];
    vi.spyOn(haptic, 'selectStart').mockImplementation(() => (calls.push('start'), false));
    vi.spyOn(haptic, 'select').mockImplementation(() => (calls.push('select'), false));
    vi.spyOn(haptic, 'selectEnd').mockImplementation(() => (calls.push('end'), false));
    const at = (v: number) => tickX(v, 20, WIDTH);

    pointer('pointerdown', at(0));
    pointer('pointermove', at(6));
    expect(host.index()).toBe(6);
    pointer('pointermove', at(6) + HOLD_PX - 1);
    expect(host.index()).toBe(6);
    pointer('pointermove', at(6) + HOLD_PX);
    expect(host.index()).toBe(8);
    pointer('pointermove', at(14));
    expect(host.index()).toBe(12);
    pointer('pointerup', at(14));
    expect(host.log).toEqual(['seek 6', 'skip 6', 'seek 8', 'seek 12', 'release 12']);
    expect(calls).toEqual(['start', 'select', 'select', 'end']);
  });

  it('opens the pending checkpoint a merged mark shows when that mark is tapped', () => {
    const { pointer, host, el } = setUp(
      (h) =>
        h.ticks.set([
          { at: 2, state: 'right' },
          { at: 3, state: 'pending' },
        ]),
      WIDTH - 16,
    );
    const mark = el.querySelectorAll<HTMLElement>('.tick');
    expect(mark).toHaveLength(1);
    const x = 8 + Number(mark[0].style.getPropertyValue('--p')) * (WIDTH - 16);
    pointer('pointerdown', x);
    pointer('pointerup', x);
    expect(host.log).toEqual(['seek 3', 'release 3']);
  });

  it('shows the hold chip only while holding', () => {
    const { pointer, el } = setUp((h) => h.ticks.set([{ at: 6, state: 'pending' }]));
    const chip = () => el.querySelector('.hold')!.textContent!.trim();
    pointer('pointerdown', tickX(0, 20, WIDTH));
    expect(chip()).toBe('');
    pointer('pointermove', tickX(8, 20, WIDTH));
    expect(chip()).toBe('Answer it, or skip?');
    expect(el.querySelector<HTMLElement>('.hold')!.style.getPropertyValue('--p'), 'over the held tick').toBe('0.3');
    pointer('pointercancel', tickX(8, 20, WIDTH));
    expect(chip()).toBe('');
  });

  it('positions on a tap, and never holds with Predict mode off or a mouse drag back', () => {
    const { pointer, host } = setUp((h) => {
      h.ticks.set([{ at: 6, state: 'pending' }]);
      h.guard.set(false);
    });
    pointer('pointerdown', tickX(15, 20, WIDTH), 'mouse');
    pointer('pointerup', tickX(15, 20, WIDTH), 'mouse');
    expect(host.index()).toBe(15);
    expect(host.log).toEqual(['seek 15']);
  });

  it('shows no focus ring on the Timeline a drag focused, until a key is pressed there', () => {
    const { pointer, el, fixture } = setUp();
    const timeline = el.querySelector('input')!;
    pointer('pointerdown', tickX(4, 20, WIDTH), 'mouse');
    pointer('pointerup', tickX(4, 20, WIDTH), 'mouse');
    expect(timeline.classList).toContain('pointer-focus');
    timeline.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(timeline.classList).not.toContain('pointer-focus');
  });

  it('takes Shift+arrows to checkpoints and Home and End to the ends on the focused Timeline', () => {
    const { el, host } = setUp();
    const timeline = el.querySelector('input')!;
    const press = (key: string, shiftKey = false) => {
      const e = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
      timeline.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect([press('ArrowRight', true), press('ArrowLeft', true), press('End'), press('Home'), press('ArrowRight')]).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(host.log).toEqual(['next', 'previous', 'result', 'seek 0']);
  });

  it('opens ⋯ as a group, closes it on Escape with focus back on ⋯, and when a checkpoint opens', () => {
    const { el, host, fixture } = setUp();
    const more = el.querySelector<HTMLButtonElement>('button[aria-label="More playback controls"]')!;
    const panel = el.querySelector('#' + more.getAttribute('aria-controls'))!;
    expect(panel.getAttribute('role')).toBe('group');
    more.click();
    fixture.detectChanges();
    expect(more.getAttribute('aria-expanded')).toBe('true');
    el.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(more);

    more.click();
    fixture.detectChanges();
    host.asking.set(true);
    fixture.detectChanges();
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes ⋯ after an action in it, but not after a speed', () => {
    const { el, fixture, host } = setUp();
    const more = el.querySelector<HTMLButtonElement>('button[aria-label="More playback controls"]')!;
    more.click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[role="radio"]')!.click();
    fixture.detectChanges();
    expect(more.getAttribute('aria-expanded')).toBe('true');
    [...el.querySelectorAll<HTMLButtonElement>('.actions button')].find((b) => b.textContent!.includes('Restart'))!.click();
    fixture.detectChanges();
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(host.log).toEqual(['restart']);
  });
});
