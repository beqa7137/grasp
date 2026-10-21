import { TestBed } from '@angular/core/testing';
import { diffFrames, getAlgorithm, traceKeys, type Frame } from '@grasp/engine';
import { ArrayViewComponent } from '../array-view.component';
import { ListViewComponent } from '../list-view.component';
import { DescribeComponent } from './describe.component';
import { MAX_ANIMATIONS, MotionService, type StageStep } from './motion.service';
import { WatchComponent } from './watch.component';

class QuietResizeObserver {
  observe() {}
  disconnect() {}
}

const binarySearch = () => {
  const algo = getAlgorithm('binary-search')!;
  return algo.trace(algo.defaultInput);
};

/** A step from frame `i - 1` to `i` that does not animate, as reduced motion, the test mode and Instant play it. */
function stillStep(frames: Frame[], i: number): StageStep {
  const keys = traceKeys(frames);
  return { id: i, events: diffFrames(frames[i - 1], frames[i], [keys[i - 1], keys[i]]), adjacent: true, scale: 0, jump: false };
}

const texts = (el: Element, selector: string) => [...el.querySelectorAll(selector)].map((e) => e.textContent!.trim());

describe('the motion layer', () => {
  beforeEach(() => vi.stubGlobal('ResizeObserver', QuietResizeObserver));
  afterEach(() => vi.unstubAllGlobals());

  it('array: leaves a dashed pin where a pointer was, with an arrow toward where it went, for one frame', () => {
    const frames = binarySearch();
    const fixture = TestBed.createComponent(ArrayViewComponent);
    fixture.componentRef.setInput('view', frames[4].array);
    fixture.componentRef.setInput('step', stillStep(frames, 4));
    fixture.componentRef.setInput('comparing', true);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(texts(el, '.ptr.trail')).toEqual(['lo →']);
    expect((el.querySelector('.ptr.trail') as HTMLElement).style.getPropertyValue('--i')).toBe('0');
    expect(texts(el, '.compare')).toEqual(['16 < 23']);
    expect(el.querySelectorAll('.cell.considering')).toHaveLength(1);
    fixture.componentRef.setInput('step', { ...stillStep(frames, 4), adjacent: false, events: [] });
    fixture.detectChanges();
    expect(el.querySelector('.ptr.trail, .compare')).toBeNull();
  });

  it('array: strikes through the old value beside a written one, and draws pins neutral but the current one', () => {
    const frames: Frame[] = [
      { line: 1, vars: {}, note: '', array: { values: [1, 2], pointers: { i: 1, j: 0 }, active: [1] } },
      { line: 1, vars: {}, note: '', array: { values: [1, 9], pointers: { i: 1, j: 0 }, active: [1] } },
    ];
    const fixture = TestBed.createComponent(ArrayViewComponent);
    fixture.componentRef.setInput('view', frames[1].array);
    fixture.componentRef.setInput('step', stillStep(frames, 1));
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(texts(el, '.cell .was')).toEqual(['2']);
    expect(texts(el, '.ptr.current')).toEqual(['i']);
  });

  it('list: keeps a dequeued front chip as a struck trail for one frame, and none when the step animates', () => {
    const algo = getAlgorithm('grid-bfs')!;
    const frames = algo.trace(algo.defaultInput);
    const fixture = TestBed.createComponent(ListViewComponent);
    fixture.componentRef.setInput('label', 'queue');
    fixture.componentRef.setInput('items', frames[4].queue!.items);
    fixture.componentRef.setInput('list', 'queue');
    fixture.componentRef.setInput('keys', traceKeys(frames)[4].queue);
    fixture.componentRef.setInput('step', stillStep(frames, 4));
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(texts(el, '.items > *')).toEqual([frames[3].queue!.items[0], ...frames[4].queue!.items]);
    expect(el.querySelector('.item.trail')!.getAttribute('aria-hidden')).toBe('true');
    expect(texts(el, '[role="listitem"]')).toEqual(frames[4].queue!.items);
    fixture.componentRef.setInput('step', { ...stillStep(frames, 4), scale: 1 });
    fixture.detectChanges();
    expect(el.querySelector('.item.trail')).toBeNull();
  });

  it('watch: marks the variables a step changed with their old values, and collapses those drawn on the stage', () => {
    const frames = binarySearch();
    const fixture = TestBed.createComponent(WatchComponent);
    fixture.componentRef.setInput('frames', frames);
    fixture.componentRef.setInput('index', 4);
    fixture.componentRef.setInput('step', stillStep(frames, 4));
    fixture.componentRef.setInput('onStage', new Set(['lo', 'hi']));
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(texts(el, '.row dt')).toEqual(['target', 'mid', 'nums[mid]']);
    expect(texts(el, '.row.changed dt')).toEqual(['mid', 'nums[mid]']);
    expect(texts(el, '.row.changed .was')).toEqual(['4', '16']);
    const toggle = el.querySelector<HTMLButtonElement>('.stage-toggle')!;
    expect(toggle.textContent!.trim()).toBe('On the stage: lo, hi');
    toggle.click();
    fixture.detectChanges();
    expect(texts(el, '.row dt')).toEqual(['target', 'mid', 'nums[mid]', 'lo', 'hi']);
    expect(texts(el, '.row.changed .was')).toEqual(['4', '16', '0']);
  });

  it("why: opens a value's history and seeks to the step that set it", () => {
    const frames = binarySearch();
    const fixture = TestBed.createComponent(WatchComponent);
    fixture.componentRef.setInput('frames', frames);
    fixture.componentRef.setInput('index', 6);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const seeks: number[] = [];
    fixture.componentInstance.seek.subscribe((at) => seeks.push(at));
    const lo = [...el.querySelectorAll<HTMLButtonElement>('.value')].find((b) => b.getAttribute('aria-label')!.startsWith('lo '))!;
    lo.click();
    fixture.detectChanges();
    expect(lo.getAttribute('aria-expanded')).toBe('true');
    expect(texts(el, 'g-why li')).toEqual(['0 at step 1, line 2', '5 at step 5, line 6']);
    expect(el.querySelector('g-why [aria-current]')!.textContent).toContain('step 5');
    el.querySelector<HTMLButtonElement>('g-why li button')!.click();
    expect(seeks).toEqual([0]);
  });

  it("describe: lists the frame's values and what the step changed", () => {
    const frames = binarySearch();
    const fixture = TestBed.createComponent(DescribeComponent);
    fixture.componentRef.setInput('frame', frames[4]);
    fixture.componentRef.setInput('index', 4);
    fixture.componentRef.setInput('events', stillStep(frames, 4).events);
    const closed = vi.fn();
    fixture.componentRef.setInput('close', closed);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.getAttribute('role')).toBe('region');
    expect(texts(el, 'caption')).toEqual(['Array', 'Variables']);
    expect(texts(el.querySelector('table')!, 'tbody td:nth-of-type(1)')).toEqual(frames[4].array!.values.map(String));
    expect(texts(el, '.changes li')).toContain('lo moves from 0 to 5.');
    fixture.componentRef.setInput('events', []);
    fixture.detectChanges();
    expect(texts(el, '.still')).toEqual(['No visible change.']);
    el.querySelector<HTMLButtonElement>('.close')!.click();
    expect(closed).toHaveBeenCalledOnce();
  });

  it("describe: on Dijkstra's first ask, shows the caption and not the note, which holds the answer, until it is answered", () => {
    const algo = getAlgorithm('dijkstra')!;
    const frames = algo.trace(algo.defaultInput);
    const at = frames.findIndex((f) => f.predict);
    const fixture = TestBed.createComponent(DescribeComponent);
    fixture.componentRef.setInput('frame', frames[at]);
    fixture.componentRef.setInput('index', at);
    fixture.componentRef.setInput('asking', true);
    fixture.componentRef.setInput('close', () => undefined);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.note')!.textContent).not.toContain('0 + 7 = 7');
    expect(el.querySelector('.note')!.textContent!.trim()).toBe(frames[at].caption);
    fixture.componentRef.setInput('asking', false);
    fixture.detectChanges();
    expect(el.querySelector('.note')!.textContent).toContain('0 + 7 = 7');
  });

  it("why: lists only the past, so a checkpoint's answer never shows before it is asked", () => {
    const frames = binarySearch();
    const fixture = TestBed.createComponent(WatchComponent);
    fixture.componentRef.setInput('frames', frames);
    fixture.componentRef.setInput('index', 3);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    for (const button of el.querySelectorAll<HTMLButtonElement>('.value')) {
      button.click();
      fixture.detectChanges();
      for (const entry of texts(el, 'g-why li')) expect(Number(entry.match(/at step (\d+)/)![1])).toBeLessThanOrEqual(4);
    }
    expect(texts(el, '.row:has(g-why) dt')).toHaveLength(1);
  });

  it('MotionService: finishes every running animation, and runs at most 60 at once', () => {
    const motion = new MotionService();
    const started: { finish: ReturnType<typeof vi.fn> }[] = [];
    const el = {
      animate: () => {
        const animation = { finish: vi.fn(), cancel: vi.fn(), addEventListener: vi.fn() };
        started.push(animation);
        return animation;
      },
    } as unknown as Element;
    for (let i = 0; i < MAX_ANIMATIONS + 5; i++) motion.animate(el, [], { duration: 100 });
    expect(started).toHaveLength(MAX_ANIMATIONS);
    motion.finishAll();
    expect(started.every((a) => a.finish.mock.calls.length === 1)).toBe(true);
    motion.animate(el, [], { duration: 100 });
    expect(started).toHaveLength(MAX_ANIMATIONS + 1);
  });
});
