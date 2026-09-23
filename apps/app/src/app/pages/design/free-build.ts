import type { Scenario } from '@grasp/engine';

export const FREE_BUILD: Scenario = {
  id: 'free-build',
  title: 'Free Build',
  tagline: 'No goals. Dial the traffic and see what breaks.',
  brief: 'An open canvas. Change the workload with the sliders, add components, and pull the chaos lever on anything you like.',
  workload: { rps: 5_000, readRatio: 0.9 },
  goals: { maxP99Ms: Number.POSITIVE_INFINITY, maxErrorRate: 1, maxMonthlyCost: Number.POSITIVE_INFINITY },
  starter: {
    nodes: [
      { id: 'users', kind: 'client', x: 80, y: 240, instances: 1 },
      { id: 'lb', kind: 'lb', x: 270, y: 240, instances: 2 },
      { id: 'app', kind: 'app', x: 460, y: 240, instances: 3 },
      { id: 'db', kind: 'db', x: 700, y: 240, instances: 1 },
    ],
    edges: [
      { from: 'users', to: 'lb' },
      { from: 'lb', to: 'app' },
      { from: 'app', to: 'db' },
    ],
  },
  hints: [],
  takeaway: '',
};
