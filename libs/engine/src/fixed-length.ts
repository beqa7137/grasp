/** A list of exactly N items, so a definition cannot have more or fewer entries than its catalog declares. */
export type FixedLength<T, N extends number, Acc extends T[] = []> = Acc['length'] extends N ? Acc : FixedLength<T, N, [...Acc, T]>;
