import { MAX_LIVE, ParticlePool, PlayClock, travelKeyframes, watchMotion } from './particles';

describe('travelKeyframes', () => {
  it('spaces corners by their share of the length, and fades at the end unless the dot breaks', () => {
    const frames = travelKeyframes(
      [
        [0, 0],
        [30, 0],
        [30, 10],
      ],
      true,
    );
    expect(frames.map((f) => f.offset)).toEqual([0, 0.75, 1]);
    expect(frames[1]['transform']).toBe('translate(30px, 0px)');
    expect(frames.map((f) => f['opacity'])).toEqual([1, 1, 0]);
    expect(
      travelKeyframes(
        [
          [0, 0],
          [1, 0],
        ],
        false,
      ).at(-1)!['opacity'],
    ).toBe(1);
  });
});

describe('ParticlePool', () => {
  let animations: {
    pause: ReturnType<typeof vi.fn>;
    play: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    playState: string;
    onfinish: null | (() => void);
  }[];

  beforeEach(() => {
    animations = [];
    Element.prototype.animate = vi.fn(function () {
      const a = { pause: vi.fn(() => (a.playState = 'paused')), play: vi.fn(), cancel: vi.fn(), playState: 'running', onfinish: null };
      animations.push(a);
      return a as unknown as Animation;
    });
  });

  const layer = () => document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const path = [
    [0, 0],
    [10, 0],
  ] as const;

  it('runs at most 60 dots at once, dropping the rest rather than queueing them', () => {
    const g = layer();
    const pool = new ParticlePool(g);
    for (let i = 0; i < MAX_LIVE + 5; i++) pool.emit(path, 'hit', 500);
    expect(g.children).toHaveLength(MAX_LIVE);
    expect(animations).toHaveLength(MAX_LIVE);
  });

  it('pauses, resumes and reuses finished dots', async () => {
    const g = layer();
    const pool = new ParticlePool(g);
    pool.emit(path, 'hit', 500);
    pool.pause();
    expect(animations[0].pause).toHaveBeenCalled();
    pool.emit(path, 'miss', 500);
    expect(animations[1].pause).toHaveBeenCalled();
    pool.resume();
    expect(animations[0].play).toHaveBeenCalled();
    animations[0].onfinish!();
    await new Promise((r) => setTimeout(r));
    expect(g.children[0].getAttribute('visibility')).toBe('hidden');
    pool.emit(path, 'lost', 500, { breaks: true });
    expect(g.children).toHaveLength(2);
    expect(g.children[0].getAttribute('visibility')).toBeNull();
    animations[2].onfinish!();
    expect(g.children[0].getAttribute('class')).toBe('particle lost broken');
    pool.clear();
    expect([...g.children].map((c) => c.getAttribute('visibility'))).toEqual(['hidden', 'hidden']);
  });
});

describe('PlayClock', () => {
  it('reports progress each frame, keeps its place through a pause, and ends', () => {
    let now = 0;
    let pending: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => ((pending = cb), 1));
    vi.stubGlobal('cancelAnimationFrame', () => (pending = null));
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const frame = (t: number) => {
      now = t;
      const cb = pending;
      pending = null;
      cb?.(t);
    };
    const seen: number[] = [];
    const end = vi.fn();
    const clock = new PlayClock(1000, (p) => seen.push(p), end);
    clock.pause();
    clock.start();
    expect(pending).toBeNull();
    clock.resume();
    frame(250);
    clock.pause();
    now = 5000;
    clock.resume();
    frame(5500);
    frame(5800);
    expect(seen).toEqual([0, 0.25, 0.75, 1]);
    expect(end).toHaveBeenCalledOnce();
    expect(pending).toBeNull();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});

describe('an endless PlayClock', () => {
  it('reports elapsed time until stopped and never ends by itself', () => {
    let pending: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => ((pending = cb), 1));
    vi.stubGlobal('cancelAnimationFrame', () => (pending = null));
    vi.spyOn(performance, 'now').mockImplementation(() => 0);
    const seen: number[] = [];
    const end = vi.fn();
    const clock = new PlayClock(Infinity, (p, elapsed) => seen.push(p, elapsed), end);
    clock.start();
    for (const t of [1000, 60_000]) {
      const cb = pending!;
      pending = null;
      cb(t);
    }
    clock.stop();
    expect(seen).toEqual([0, 0, 0, 1000, 0, 60_000]);
    expect(end).not.toHaveBeenCalled();
    expect(pending).toBeNull();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});

describe('watchMotion', () => {
  it('asks again whenever data-motion changes', async () => {
    const seen: boolean[] = [];
    const stop = watchMotion(
      () => document.documentElement.getAttribute('data-motion') !== 'reduced',
      (allowed) => seen.push(allowed),
    );
    document.documentElement.setAttribute('data-motion', 'reduced');
    await Promise.resolve();
    document.documentElement.removeAttribute('data-motion');
    await Promise.resolve();
    stop();
    document.documentElement.setAttribute('data-motion', 'reduced');
    await Promise.resolve();
    document.documentElement.removeAttribute('data-motion');
    expect(seen).toEqual([true, false, true]);
  });
});
