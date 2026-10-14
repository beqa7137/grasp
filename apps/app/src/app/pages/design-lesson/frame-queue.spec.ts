import { FrameQueue } from './frame-queue';

describe('FrameQueue', () => {
  it('runs one job a frame, in order, and a newer job under the same key replaces a waiting one', () => {
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    const ran: string[] = [];
    const queue = new FrameQueue();
    queue.run('fleet', () => ran.push('fleet'));
    queue.run('histogram', () => ran.push('histogram 1'));
    queue.run('histogram', () => ran.push('histogram 2'));
    queue.run('p99', () => ran.push('p99'));
    const frame = () => {
      frames.shift()!(0);
      vi.runOnlyPendingTimers();
    };
    frame();
    expect(ran).toEqual(['fleet']);
    frame();
    expect(ran).toEqual(['fleet', 'histogram 2']);
    frame();
    expect(ran).toEqual(['fleet', 'histogram 2', 'p99']);
    expect(frames).toHaveLength(0);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
