export function errorCategory(error: unknown): 'type' | 'range' | 'syntax' | 'unknown' {
  if (error instanceof TypeError) return 'type';
  if (error instanceof RangeError) return 'range';
  if (error instanceof SyntaxError) return 'syntax';
  return 'unknown';
}
