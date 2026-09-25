/** A tuple of exactly N items. */
export type FixedLength<T, N extends number, Acc extends T[] = []> = Acc['length'] extends N ? Acc : FixedLength<T, N, [...Acc, T]>;
