import { DEFAULT_OBJECT_SHARE } from './object-share.js';
import type { Design, Workload } from './types.js';

/** A Design Lab board as the app stores it between visits. */
export interface SavedDesign {
  design: Design;
  workload: Workload;
}

/**
 * Boards saved before the object share moved into the workload kept it on the object store node, and each app sent that
 * share to the first object store it was connected to. When every app used the same share and only apps feed stores,
 * that share is named in the workload, which simulates the board exactly as before. Otherwise (a CDN or workers also
 * feed a store, or two apps used different shares) the board keeps its node shares and the old rule, which reads them,
 * so it too simulates exactly as before.
 */
export function migrateSavedDesign({ design, workload }: SavedDesign): SavedDesign {
  const stripped = { ...design, nodes: design.nodes.map(({ share: _share, ...node }) => node) };
  if (workload.objectShare !== undefined) return { design: stripped, workload };
  const byId = new Map(design.nodes.map((n) => [n.id, n]));
  const shares = new Set(
    design.nodes
      .filter((n) => n.kind === 'app')
      .map((app) => design.edges.map((e) => (e.from === app.id ? byId.get(e.to) : undefined)).find((n) => n?.kind === 'blob'))
      .filter((store) => store !== undefined)
      .map((store) => store.share ?? DEFAULT_OBJECT_SHARE),
  );
  const fedElsewhere = design.edges.some(
    (e) => byId.get(e.to)?.kind === 'blob' && ['cdn', 'worker'].includes(byId.get(e.from)?.kind ?? ''),
  );
  if (fedElsewhere || shares.size > 1) return { design, workload };
  return { design: stripped, workload: { ...workload, objectShare: [...shares][0] ?? DEFAULT_OBJECT_SHARE } };
}
