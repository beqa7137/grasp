let last = 0;

/** An element id for ARIA references, such as `aria-labelledby`, that stays unique when a component is shown more than once. */
export function uniqueId(prefix: string): string {
  return `${prefix}-${++last}`;
}
