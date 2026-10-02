import { DEFAULT_OBJECT_SHARE } from './catalog.js';
import type { Design, DesignNode, Workload } from './types.js';

/** A Design Lab board as the app stores it between visits. */
export interface SavedDesign {
  design: Design;
  workload: Workload;
}

type LegacyNode = DesignNode & { share?: number };

/**
 * Boards saved before the object share moved into the workload kept it on the object store node, and each app sent that
 * share to the first object store it was connected to. Such a board gets the share the first app used, which simulates it
 * exactly as before unless a CDN or workers also feed a store: those split by instance count under the old rule, so a
 * board like that keeps the old rule unless the learner had moved the share off its default.
 */
export function migrateSavedDesign({ design, workload }: SavedDesign): SavedDesign {
  const nodes = design.nodes as LegacyNode[];
  const stripped = { ...design, nodes: nodes.map(({ share: _share, ...node }) => node) };
  if (workload.objectShare !== undefined) return { design: stripped, workload };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const firstStore = nodes
    .filter((n) => n.kind === 'app')
    .map((app) => design.edges.map((e) => (e.from === app.id ? byId.get(e.to) : undefined)).find((n) => n?.kind === 'blob'))
    .find((n) => n !== undefined);
  const share = firstStore?.share ?? DEFAULT_OBJECT_SHARE;
  const splitByInstances = design.edges.some(
    (e) => byId.get(e.to)?.kind === 'blob' && ['cdn', 'worker'].includes(byId.get(e.from)?.kind ?? ''),
  );
  if (splitByInstances && share === DEFAULT_OBJECT_SHARE) return { design: stripped, workload };
  return { design: stripped, workload: { ...workload, objectShare: share } };
}
