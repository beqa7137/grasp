/**
 * Each line's span, found by its text, for `Frame.span`. It throws when a line does not hold its text exactly once, so
 * editing the code cannot leave a span on the wrong columns.
 */
export function spansOf(code: readonly string[], parts: Record<number, string>): Record<number, [number, number]> {
  return Object.fromEntries(
    Object.entries(parts).map(([line, part]) => {
      const text = code[Number(line) - 1] ?? '';
      const start = text.indexOf(part);
      if (start < 0 || text.indexOf(part, start + 1) >= 0) throw new Error(`line ${line} does not contain "${part}" exactly once`);
      return [line, [start, start + part.length]];
    }),
  );
}
