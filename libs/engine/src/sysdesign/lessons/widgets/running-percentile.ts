/** A binary heap ordered by `before`: the root is the value that comes first. */
class Heap {
  private readonly items: number[] = [];
  constructor(private readonly before: (a: number, b: number) => boolean) {}

  get size() {
    return this.items.length;
  }

  peek() {
    return this.items[0];
  }

  push(v: number) {
    const a = this.items;
    a.push(v);
    for (let i = a.length - 1; i > 0;) {
      const up = (i - 1) >> 1;
      if (!this.before(a[i], a[up])) break;
      [a[i], a[up]] = [a[up], a[i]];
      i = up;
    }
  }

  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let i = 0; ;) {
        const [l, r] = [2 * i + 1, 2 * i + 2];
        let best = i;
        if (l < a.length && this.before(a[l], a[best])) best = l;
        if (r < a.length && this.before(a[r], a[best])) best = r;
        if (best === i) break;
        [a[i], a[best]] = [a[best], a[i]];
        i = best;
      }
    }
    return top;
  }
}

/**
 * A percentile of a growing set of values, kept as they arrive: `value()` is what sorting them all and taking the one at
 * index `floor(n * q)` would give, at a heap's cost per value rather than a sort per question.
 */
export class RunningPercentile {
  /** The values below the percentile's place, largest first, and the rest, smallest first. */
  private readonly low = new Heap((a, b) => a > b);
  private readonly high = new Heap((a, b) => a < b);

  constructor(private readonly q: number) {}

  add(v: number) {
    if (this.high.size && v >= this.high.peek()) this.high.push(v);
    else this.low.push(v);
    const n = this.low.size + this.high.size;
    const above = n - Math.floor(n * this.q);
    while (this.high.size > above) this.low.push(this.high.pop());
    while (this.high.size < above) this.high.push(this.low.pop());
  }

  value(): number | null {
    return this.high.size ? this.high.peek() : null;
  }
}
