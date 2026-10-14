import { FleetScene, queuesAt, waitingBlocks, type FleetColors, type FleetLane } from './fleet-scene';

const COLORS: FleetColors = {
  current: 'blue',
  currentSoft: 'lightblue',
  considering: 'orange',
  consideringSoft: 'wheat',
  critical: 'red',
  stage: 'white',
  surface: 'white',
  text: 'black',
  muted: 'gray',
  line: 'gray',
  font: '600 11px monospace',
};
const lane = (y: number): FleetLane => ({ y, height: 20, x0: 60, x1: 260, serverX: 264, serverW: 30, boxX: 264, cap: 50, name: '' });

function setup() {
  const calls: string[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_, name) => (typeof name === 'string' ? (...args: unknown[]) => calls.push(`${name}(${args.join(',')})`) : undefined),
      set: () => true,
    },
  );
  const frames: ((now: number) => void)[] = [];
  const dots: number[] = [];
  const scene = new FleetScene(
    { width: 0, height: 0, getContext: () => ctx },
    (paint) => frames.push(paint),
    (n) => dots.push(n),
  );
  const frame = (now: number) => frames.shift()?.(now);
  return { scene, calls, frames, frame, dots };
}

describe('FleetScene', () => {
  it('counts waiting blocks after the one in service, at the run scale, and interpolates the queues between samples', () => {
    expect(waitingBlocks(1, 1, 50)).toBe(0);
    expect(waitingBlocks(11, 5, 50)).toBe(2);
    expect(waitingBlocks(5_000, 50, 50)).toBe(50);
    expect(
      queuesAt(
        [
          [0, 10],
          [10, 30],
        ],
        0.5,
      ),
    ).toEqual([5, 20]);
    expect(
      queuesAt(
        [
          [0, 10],
          [10, 30],
        ],
        9,
      ),
    ).toEqual([10, 30]);
  });

  it('paints once per change, and only every frame while dots flow', () => {
    const { scene, calls, frames, frame } = setup();
    scene.update({
      box: { x: 0, y: 0, width: 300, height: 100 },
      dpr: 2,
      colors: COLORS,
      lanes: [lane(20), lane(50)],
      queues: [
        [0, 0],
        [6, 2],
      ],
      t: 1,
    });
    scene.update({ perBlock: 1 });
    expect(frames).toHaveLength(1);
    frame(0);
    expect(calls.filter((c) => c.startsWith('fillRect')).length).toBeGreaterThan(0);
    expect(frames).toHaveLength(0);
    scene.update({
      flow: true,
      picks: [0, 1],
      links: [
        [
          [0, 20],
          [260, 20],
        ],
        [
          [0, 50],
          [260, 50],
        ],
      ],
    });
    frame(16);
    expect(frames).toHaveLength(1);
    scene.update({ flow: false });
    frame(32);
    expect(frames).toHaveLength(0);
  });

  it('sends dots in the policy order while flowing, and reports how many are live', () => {
    const { scene, frame, dots } = setup();
    scene.update({
      box: { x: 0, y: 0, width: 300, height: 100 },
      colors: COLORS,
      lanes: [lane(20), lane(50)],
      queues: [[0, 0]],
      picks: [0, 1],
      links: [
        [
          [0, 20],
          [260, 20],
        ],
        [
          [0, 50],
          [260, 50],
        ],
      ],
      flow: true,
    });
    for (let now = 0; now <= 700; now += 16) frame(now);
    expect(Math.max(...dots)).toBeGreaterThanOrEqual(5);
    scene.update({ flow: false });
    frame(800);
    expect(dots.at(-1)).toBe(0);
  });
});
