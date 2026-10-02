import { DEFAULT_OBJECT_SHARE } from './object-share.js';
import type { Design, Scenario, Workload } from './types.js';

/** A Design Lab board as the app stores it between visits. */
export interface SavedDesign {
  design: Design;
  workload: Workload;
}

/**
 * The board a visit opens with: the saved design, under its saved workload in a free or case build and the mission's
 * own otherwise. Nothing is rewritten, so a board saved before the workload named its object share keeps the share on
 * its stores and the old rule reads it, until the learner names a share with the Files control (free and case builds
 * only; a mission board stays on the old rule). Measured against the engine before that change, such boards simulate
 * the same except where the simulator itself changed: two or more queues holding work (workers now drain them as the
 * exact fluid model says), a queue holding nothing (its workers no longer count as drain), and a replica node under
 * two or more databases (it now covers none of them).
 */
export function restoreBoard(saved: SavedDesign | null, scenario: Scenario, free: boolean): SavedDesign {
  return {
    design: saved?.design ?? structuredClone(scenario.starter),
    workload: free && saved ? saved.workload : scenario.workload,
  };
}

/** Names the workload's object share, which replaces any share an old board kept on its stores. */
export function nameObjectShare({ design, workload }: SavedDesign, objectShare: number): SavedDesign {
  const legacy = design.nodes.some((n) => n.share !== undefined);
  return {
    design: legacy ? { ...design, nodes: design.nodes.map(({ share: _share, ...node }) => node) } : design,
    workload: { ...workload, objectShare },
  };
}

/** The share of files a board on the old rule runs at: the one its first app linked to a store sends its first store. */
export function legacyObjectShare({ nodes, edges }: Design): number {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const app of nodes) {
    if (app.kind !== 'app') continue;
    const store = edges.map((e) => (e.from === app.id ? byId.get(e.to) : undefined)).find((n) => n?.kind === 'blob');
    if (store) return store.share ?? DEFAULT_OBJECT_SHARE;
  }
  return DEFAULT_OBJECT_SHARE;
}
