import type { Design, DesignNode, Workload } from './types.js';

/** A Design Lab board as the app stores it between visits. */
export interface SavedDesign {
  design: Design;
  workload: Workload;
}

type LegacyNode = DesignNode & { share?: number };

/**
 * Boards saved before the object share moved into the workload kept it on the object store node, and each app sent that
 * share to the first object store it was connected to. The share the first such app used becomes the workload's, so an
 * old board simulates as it did.
 */
export function migrateSavedDesign({ design, workload }: SavedDesign): SavedDesign {
  const nodes = design.nodes as LegacyNode[];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const firstStore = nodes
    .filter((n) => n.kind === 'app')
    .map((app) => design.edges.map((e) => (e.from === app.id ? byId.get(e.to) : undefined)).find((n) => n?.kind === 'blob'))
    .find((n) => n !== undefined);
  const share = firstStore?.share;
  return {
    design: { ...design, nodes: nodes.map(({ share: _share, ...node }) => node) },
    workload: workload.objectShare === undefined && share !== undefined ? { ...workload, objectShare: share } : workload,
  };
}
