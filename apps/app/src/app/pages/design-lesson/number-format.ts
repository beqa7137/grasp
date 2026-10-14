/**
 * A number as the lesson widgets print it, grouped in thousands, as Angular's DecimalPipe would: the lazy widgets use
 * this instead, since importing the pipe would split a first-paint chunk (`@angular/common`'s location code shares it).
 */
export const formatNumber = (value: number, maxFraction = 3, minFraction = 0) =>
  value.toLocaleString('en-US', { minimumFractionDigits: minFraction, maximumFractionDigits: maxFraction });
