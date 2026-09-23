/** Node and legend styling shared by the SVG graph and tree views. */
export const NODE_STYLES = `
  .node .body {
    fill: var(--g-raised);
    stroke: var(--g-line-strong);
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
    fill: rgba(255, 181, 71, 0.16);
    stroke: var(--g-warn);
  }
  .node[data-state='done'] .body {
    fill: rgba(61, 220, 151, 0.16);
    stroke: var(--g-found);
  }
  .node[data-state='active'] .body {
    fill: var(--g-active);
    stroke: var(--g-active);
  }
  .node[data-state='active'] .label {
    fill: #0b0d12;
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
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    justify-content: center;
    margin-top: 10px;
    font-size: 12px;
    color: var(--g-muted);
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .legend i {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1.5px solid;
  }
  .legend i[data-state='active'] {
    background: var(--g-active);
    border-color: var(--g-active);
  }
  .legend i[data-state='frontier'] {
    background: rgba(255, 181, 71, 0.16);
    border-color: var(--g-warn);
  }
  .legend i[data-state='done'] {
    background: rgba(61, 220, 151, 0.16);
    border-color: var(--g-found);
  }
  .legend i[data-state='marked'] {
    border-color: var(--g-found);
    box-shadow: 0 0 0 2px var(--g-surface), 0 0 0 3.5px var(--g-found);
  }
`;
