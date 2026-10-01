/** The error rate a whole service shows when a share `exposure` of its traffic runs a path failing at `treated` and the rest at `base`. */
export const blendedRate = (base: number, treated: number, exposure: number) => base * (1 - exposure) + treated * exposure;

/** Percentages as text without float noise: 0.505 stays 0.505, 0.5 becomes 0.5. */
export const percentText = (fraction: number) => `${Number((fraction * 100).toFixed(4))}%`;
