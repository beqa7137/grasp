import { DEFAULT_OBJECT_SHARE, FREE_BUILD_GOALS, type Scenario } from '@grasp/engine';

export const FREE_BUILD: Scenario = {
  id: 'free-build',
  title: 'Free Build',
  tagline: 'Your own goals: p99 within 200 ms, errors within 1%. Dial the traffic and see what breaks.',
  brief: 'An open canvas. Change the workload, add components, and pull the chaos lever on anything you like.',
  workload: { rps: 5_000, readRatio: 0.9, objectShare: DEFAULT_OBJECT_SHARE },
  goals: FREE_BUILD_GOALS,
  starter: {
    nodes: [
      { id: 'users', kind: 'client', x: 80, y: 240, instances: 1 },
      { id: 'lb', kind: 'lb', x: 300, y: 240, instances: 2 },
      { id: 'app', kind: 'app', x: 520, y: 240, instances: 3 },
      { id: 'db', kind: 'db', x: 760, y: 240, instances: 1 },
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
