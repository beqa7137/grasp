import { simulate, type Design } from '@grasp/engine';
import { heatOf, nameLines, sysNodeView } from './node-view';

const design: Design = {
  nodes: [
    { id: 'users', kind: 'client', x: 80, y: 240, instances: 1 },
    { id: 'app', kind: 'app', x: 400, y: 240, instances: 2, failed: 1 },
    { id: 'db', kind: 'db', x: 700, y: 240, instances: 3, shardKey: 'hash' },
  ],
  edges: [
    { from: 'users', to: 'app' },
    { from: 'app', to: 'db' },
  ],
};

describe('sysNodeView', () => {
  const result = simulate(design, { rps: 2_000, readRatio: 0.995, botRps: 500 });
  const client = { rps: 2_000, readRatio: 0.995, botRps: 500 };

  it('steps the heat ramp at 50, 70 and 85%', () => {
    expect([0.49, 0.5, 0.69, 0.7, 0.84, 0.85, 1.4].map(heatOf)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });

  it('splits a long name at the space nearest its middle, and keeps a short one whole', () => {
    expect(nameLines('Bodies and attachments')).toEqual(['Bodies and', 'attachments']);
    expect(nameLines('App Servers')).toEqual(['App Servers']);
    expect(nameLines('Supercalifragilistic')).toEqual(['Supercalifragilistic']);
  });

  it('gives the client its traffic and its exact read share, and a node its load, time and live count', () => {
    const users = sysNodeView(design.nodes[0], result.nodes['users'], 'Users', 'client', client);
    expect([users.stat, users.detail, users.extra, users.meter, users.count]).toEqual(['2.0k rps', '99.5% reads', '+500 bots', null, '']);
    const senders = sysNodeView(design.nodes[0], result.nodes['users'], 'Senders and apps', 'client', client);
    expect([senders.detail, senders.extra]).toEqual(['99.5% reads · +500 bots', '']);
    const app = sysNodeView(design.nodes[1], result.nodes['app'], 'App', 'app', client);
    expect(app.count).toBe('1/2');
    expect(app.stat).toBe(`${Math.round(result.nodes['app'].utilization * 100)}%`);
    expect(app.ms).toBe(`${Math.round(result.nodes['app'].latencyMs)} ms`);
    const db = sysNodeView(design.nodes[2], result.nodes['db'], 'DB', 'db', client);
    expect(db.shards).toHaveLength(3);
    expect(db.hitRate).toBeNull();
  });

  it('draws a node that is down with no load or time', () => {
    const down = { ...design.nodes[1], failed: 2 };
    const view = sysNodeView(
      down,
      simulate({ ...design, nodes: [design.nodes[0], down, design.nodes[2]] }, client).nodes['app'],
      'App',
      'app',
      client,
    );
    expect([view.status, view.stat, view.ms, view.meter, view.count]).toEqual(['down', 'down', '', 0, '0/2']);
  });
});
