/** Node styling shared by the SVG graph and tree views. */
export const NODE_STYLES = `
  .node .body {
    fill: var(--g-raised);
    stroke: var(--g-stroke);
    stroke-width: 1.5;
    transition:
      fill 0.25s,
      stroke 0.25s;
  }
  .node .label {
    font: 600 12px var(--g-font-mono);
    fill: var(--g-text);
    text-anchor: middle;
    dominant-baseline: central;
    pointer-events: none;
  }
  .node[data-state='frontier'] .body {
    fill: rgba(var(--g-warn-rgb), 0.16);
    stroke: var(--g-warn);
  }
  .node[data-state='done'] .body {
    fill: rgba(var(--g-found-rgb), 0.16);
    stroke: var(--g-found);
  }
  .node[data-state='active'] .body {
    fill: var(--g-active);
    stroke: var(--g-active);
  }
  .node[data-state='active'] .label {
    fill: var(--g-on-fill);
  }
  .node .ring {
    fill: none;
    stroke: var(--g-found);
    stroke-width: 1.5;
  }
  .badge {
    font: 600 11px var(--g-font-mono);
    fill: var(--g-accent);
    text-anchor: middle;
    dominant-baseline: central;
    paint-order: stroke;
    stroke: var(--g-surface);
    stroke-width: 3px;
    stroke-linejoin: round;
  }
`;
