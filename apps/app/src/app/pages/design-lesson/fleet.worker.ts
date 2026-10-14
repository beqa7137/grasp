/// <reference lib="webworker" />
import { FleetScene, type FleetUpdate } from './fleet-scene';

/**
 * Paints the Load Balancing fleet off the page's main thread (`fleet-painter.ts`): the page sends state, this paints
 * it, and while dots flow it animates them on its own frames.
 */
let scene: FleetScene | null = null;
const frame = (paint: (now: number) => void) =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(paint) : setTimeout(() => paint(performance.now()), 16);

addEventListener('message', ({ data }: MessageEvent<{ canvas?: OffscreenCanvas; update?: FleetUpdate }>) => {
  if (data.canvas) scene = new FleetScene(data.canvas, frame, (dots) => postMessage({ dots }));
  if (data.update) scene?.update(data.update);
});
