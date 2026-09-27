export class MinHeap {
  private readonly items: [number, number][] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: [number, number]): void {
    this.items.push(item);
    for (let i = this.items.length - 1; i > 0;) {
      const parent = (i - 1) >> 1;
      if (this.items[parent][0] <= this.items[i][0]) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  pop(): [number, number] {
    if (!this.items.length) throw new Error('Cannot pop an empty heap');
    const first = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length) {
      this.items[0] = last;
      for (let i = 0; ;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.items.length && this.items[left][0] < this.items[smallest][0]) smallest = left;
        if (right < this.items.length && this.items[right][0] < this.items[smallest][0]) smallest = right;
        if (smallest === i) break;
        [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
        i = smallest;
      }
    }
    return first;
  }
}
