import { FleetScene, type FleetColors, type FleetUpdate } from './fleet-scene';

/**
 * WebKit (Safari, every iOS browser and the iOS app) paints on the page although it can hand a canvas to a worker: under
 * load, a worker painting that canvas crashed WebKit's page or left the simulation worker's answers undelivered.
 */
const paintsInWorker = (canvas: HTMLCanvasElement) =>
  typeof canvas.transferControlToOffscreen === 'function' &&
  typeof Worker !== 'undefined' &&
  !/AppleWebKit(?!.*Chrome)/.test(navigator.userAgent);

/**
 * The Load Balancing fleet's painter. Where the browser can hand a canvas to a worker reliably, the fleet is painted and
 * animated there, so the page's main thread only sends state and a settings change never waits on a paint or its
 * compositing; elsewhere the same scene paints on the page.
 */
export class FleetPainter {
  private readonly worker: Worker | null = null;
  private readonly local: FleetScene | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    onDots: (live: number) => void,
  ) {
    if (paintsInWorker(canvas)) {
      const offscreen = canvas.transferControlToOffscreen();
      this.worker = new Worker(new URL('./fleet.worker', import.meta.url), { type: 'module' });
      this.worker.addEventListener('message', ({ data }: MessageEvent<{ dots: number }>) => onDots(data.dots));
      this.worker.addEventListener('error', () => console.error('The fleet painter worker failed'));
      this.worker.postMessage({ canvas: offscreen }, [offscreen]);
    } else {
      this.local = new FleetScene(canvas, (paint) => requestAnimationFrame(paint), onDots);
    }
  }

  update(u: FleetUpdate) {
    if (u.box) {
      const { x, y, width, height } = u.box;
      Object.assign(this.canvas.style, { width: `${width}px`, height: `${height}px`, transform: `translate(${x}px, ${y}px)` });
    }
    if (this.worker) this.worker.postMessage({ update: u });
    else this.local?.update(u);
  }

  destroy() {
    this.worker?.terminate();
    this.local?.stop();
  }
}

const TONES: Record<Exclude<keyof FleetColors, 'font'>, string> = {
  current: '--g-viz-current',
  currentSoft: '--g-viz-current-soft',
  considering: '--g-viz-considering',
  consideringSoft: '--g-viz-considering-soft',
  critical: '--g-viz-critical',
  stage: '--g-viz-stage',
  surface: '--g-surface',
  text: '--g-text',
  muted: '--g-muted',
  line: '--g-line-strong',
};

/** The theme's colours and the label font, as the canvas needs them: read once, and again on a theme change. */
export function fleetColors(source: Element): FleetColors {
  const style = getComputedStyle(source);
  const read = (name: string) => style.getPropertyValue(name).trim();
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const colors = Object.fromEntries(Object.entries(TONES).map(([k, v]) => [k, read(v)])) as Omit<FleetColors, 'font'>;
  return { ...colors, font: `600 ${parseFloat(read('--g-text-label')) * rem}px ${read('--g-font-mono')}` };
}
