const formats = new Map<string, Intl.NumberFormat>();

/**
 * A number as the lesson widgets print it, grouped in thousands, as Angular's DecimalPipe would: the lazy widgets use
 * this instead, since importing the pipe would split a first-paint chunk (`@angular/common`'s location code shares it).
 * Each format is built once: `toLocaleString` builds one per call, which dominated a stage's layout.
 */
export const formatNumber = (value: number, maxFraction = 3, minFraction = 0) => {
  const key = `${maxFraction},${minFraction}`;
  let f = formats.get(key);
  if (!f)
    formats.set(key, (f = new Intl.NumberFormat('en-US', { minimumFractionDigits: minFraction, maximumFractionDigits: maxFraction })));
  return f.format(value);
};
