/// <reference lib="webworker" />
import type { SimRequest } from './sim-protocol';
import { simulate } from './simulate';

addEventListener('message', ({ data }: MessageEvent<{ id: number; request: SimRequest }>) => {
  // A request that throws answers with its error, so the page says so instead of waiting for an answer forever.
  try {
    postMessage({ id: data.id, result: simulate(data.request) });
  } catch (error) {
    postMessage({ id: data.id, error: String(error) });
  }
});
