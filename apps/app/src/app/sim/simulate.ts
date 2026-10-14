import { LB_EXPERIMENTS, balanceRun, renderExperiment } from '@grasp/engine';
import type { SimRequest } from './sim-protocol';

/** Answers a simulation request in the worker; unit tests call it directly. */
export function simulate(request: SimRequest): unknown {
  switch (request.kind) {
    case 'balance':
      return balanceRun(request.policy, request.settings, { samples: request.samples });
    case 'lb-experiments':
      return LB_EXPERIMENTS.map(renderExperiment);
  }
}
