/** A template line to recall. The shown line is `template[line]`; distractors are plausible, subtly wrong lines. */
export interface Cloze {
  line: number;
  distractors: [string, string, string];
  why: string;
  hint?: string;
}

export const CLOZES: Record<string, Cloze[]> = {
  hashing: [
    {
      line: 3,
      distractors: ['seen.set(need(x), i);', 'seen.set(i, x);', 'seen.clear();'],
      why: 'Store the value after checking, keyed by value, so a later element can find its partner — and an element never pairs with itself.',
    },
  ],
  'two-pointers': [
    {
      line: 3,
      distractors: ['if (tooSmall(l, r)) r--; else l++;', 'l++; r--;', 'if (tooSmall(l, r)) l--; else r++;'],
      why: 'Too small → only moving l right can grow the sum; too big → move r left. Moving both at once skips candidates.',
    },
  ],
  'sliding-window': [
    {
      line: 3,
      distractors: ['if (!valid()) left = right;', 'while (valid()) remove(a[left++]);', 'while (!valid()) remove(a[right--]);'],
      why: 'Shrink from the left until the window is valid again. It is a while, not an if: one eviction may not be enough.',
    },
    {
      line: 4,
      distractors: ['best = Math.max(best, right - left);', 'best = right - left + 1;', 'best = Math.max(best, left - right + 1);'],
      why: 'The window [left, right] is inclusive, so its length is right − left + 1 — and it only counts once the window is valid.',
    },
  ],
  'binary-search': [
    {
      line: 3,
      distractors: [
        'if (feasible(mid)) hi = mid - 1; else lo = mid;',
        'if (feasible(mid)) lo = mid; else hi = mid;',
        'if (feasible(mid)) return mid; else lo = mid + 1;',
      ],
      why: 'Searching for the first feasible value: a feasible mid stays a candidate (hi = mid); an infeasible one is ruled out (lo = mid + 1). Setting lo = mid can loop forever.',
    },
  ],
  'prefix-sum': [
    {
      line: 2,
      distractors: ['// sum(i..j) = pre[j] - pre[i]', '// sum(i..j) = pre[j] - pre[i - 1]', '// sum(i..j) = pre[j + 1] - pre[i + 1]'],
      why: 'pre[k] holds the sum of the first k elements, so elements i..j sum to pre[j + 1] − pre[i]. The leading 0 removes the i = 0 edge case.',
    },
  ],
  'monotonic-stack': [
    {
      line: 2,
      distractors: [
        'if (stack.length && a[stack.at(-1)] < a[i]) resolve(stack.pop(), i);',
        'while (stack.length && a[stack.at(-1)] > a[i]) resolve(stack.pop(), i);',
        'while (stack.length && a[stack[0]] < a[i]) resolve(stack.shift(), i);',
      ],
      why: 'Pop every smaller index from the top — a loop, not a single check. The comparison direction decides next greater vs next smaller.',
    },
  ],
  'fast-slow': [
    {
      line: 2,
      distractors: ['slow = slow.next; fast = fast.next;', 'slow = slow.next.next; fast = fast.next;', 'fast = fast.next.next;'],
      why: 'Fast moves two steps and slow one: inside a cycle the gap closes by one each step, so they must meet.',
    },
  ],
  intervals: [
    {
      line: 0,
      distractors: ['intervals.sort((a, b) => a[1] - b[1]);', 'intervals.sort();', 'intervals.reverse();'],
      why: 'Merging sweeps by start time, so sort by start. (Sorting by end is for greedy selection, e.g. fewest removals.) Bare .sort() compares as strings.',
    },
    {
      line: 2,
      distractors: ['if (s <= last[1]) last[1] = e;', 'if (e <= last[1]) last[0] = s;', 'if (s < last[0]) last[1] = Math.max(last[1], e);'],
      why: 'Overlap when the new start is at or before the current end. Take the max end — a contained interval must not shrink the merge.',
    },
  ],
  heap: [
    {
      line: 0,
      distractors: ['const heap = new MaxHeap();', 'const heap = [];', 'const heap = new Set();'],
      why: 'To keep the k largest, use a min-heap of size k: the smallest survivor sits on top, ready to be evicted.',
      hint: 'keep the k largest',
    },
    {
      line: 3,
      distractors: ['if (heap.size > k) heap.push(x);', 'while (heap.size) heap.pop();', 'if (heap.size >= k) heap.pop();'],
      why: 'Evict only after exceeding k so exactly k remain; evicting at ≥ k keeps k − 1.',
    },
  ],
  bfs: [
    {
      line: 4,
      distractors: [
        'for (const v of adj(u)) { seen.add(v); q.push(v); }',
        'for (const v of adj(u)) if (!seen.has(v)) q.push(v);',
        'for (const v of adj(u)) if (!seen.has(v)) { seen.add(v); q.unshift(v); }',
      ],
      why: 'Mark seen when enqueuing, or a node can enter the queue many times. Push to the back — FIFO order is what makes distances correct.',
    },
    {
      line: 2,
      distractors: ['for (let k = 0; k < q.length; k++) {', 'while (q.length) {', 'for (let k = d; k > 0; k--) {'],
      why: 'Snapshot the queue length so exactly one level is processed per d. Reading q.length live mixes levels as you push.',
      hint: 'level by level',
    },
  ],
  'dfs-backtracking': [
    {
      line: 3,
      distractors: ['apply(c); go(state);', 'go(state); apply(c); undo(c);', 'undo(c); go(state); apply(c);'],
      why: "Choose, explore, un-choose. Without the undo, one branch's choices leak into the next.",
    },
    {
      line: 1,
      distractors: [
        'if (done(state)) { out.push(state); return; }',
        'if (done(state)) out.push(copy(state));',
        'if (!done(state)) { out.push(copy(state)); return; }',
      ],
      why: "Push a copy — state keeps mutating after this call — and return so a finished answer isn't extended further.",
    },
  ],
  'topo-sort': [
    {
      line: 3,
      distractors: [
        'for (const v of adj[u]) q.push(v);',
        'for (const v of adj[u]) if (indeg[v] === 0) q.push(v);',
        'for (const v of adj[u]) if (--indeg[u] === 0) q.push(v);',
      ],
      why: 'Taking u satisfies one prerequisite of each neighbour; a neighbour is ready only when its in-degree reaches zero.',
    },
    {
      line: 0,
      distractors: [
        'const q = nodes.filter((n) => adj[n].length === 0);',
        'const q = [nodes[0]];',
        'const q = nodes.filter((n) => indeg[n] > 0);',
      ],
      why: 'Start from every node with no prerequisites — there can be several, in different components.',
    },
  ],
  'union-find': [
    {
      line: 0,
      distractors: [
        'const find = (x) => (p[x] === x ? x : find(p[x]));',
        'const find = (x) => p[x];',
        'const find = (x) => (p[x] === x ? x : (p[x] = x));',
      ],
      why: 'Path compression: point x straight at the root while unwinding, so later finds are near-constant.',
      hint: 'with path compression',
    },
    {
      line: 1,
      distractors: [
        'const union = (a, b) => { p[a] = b; };',
        'const union = (a, b) => { a = find(a); b = find(b); p[a] = a; };',
        'const union = (a, b) => { if (a !== b) p[b] = a; };',
      ],
      why: 'Link roots, not the original nodes — rewiring a non-root node detaches it from its old set.',
    },
  ],
  dijkstra: [
    {
      line: 3,
      distractors: ['if (d < dist[u]) continue;', 'if (seen.has(u)) break;', 'if (d > dist[u]) break;'],
      why: 'The heap can hold stale, longer entries for u. Skip them with continue — break would abandon nodes still waiting.',
    },
    {
      line: 4,
      distractors: [
        'for (const [v, w] of adj[u]) pq.push([d + w, v]);',
        'for (const [v, w] of adj[u]) if (w < dist[v]) pq.push([dist[v] = w, v]);',
        'for (const [v, w] of adj[u]) if (d + w > dist[v]) pq.push([dist[v] = d + w, v]);',
      ],
      why: "Relax: push only when going through u strictly improves v's best-known distance.",
    },
  ],
  'tree-dfs': [
    {
      line: 1,
      distractors: ['if (!node.left && !node.right) return base;', 'if (node) return base;', 'if (!node) return dfs(node);'],
      why: 'The null child is the base case. Checking only for leaves crashes on nodes with a single child.',
    },
  ],
  trie: [
    {
      line: 2,
      distractors: ['root.end = true;', 'node = root;', 'node[ch].end = true;'],
      why: 'Mark the node where the word ends — otherwise "app" looks present just because "apple" was inserted.',
    },
    {
      line: 1,
      distractors: [
        'for (const ch of word) node[ch] ??= {};',
        'for (const ch of word) node = root[ch] ??= {};',
        'for (const ch of word) node = node[ch] = {};',
      ],
      why: 'Walk down, creating children only when missing. `= {}` wipes existing branches; not advancing node keeps writing at one level.',
    },
  ],
  'dp-1d': [
    {
      line: 2,
      distractors: [
        'for (let i = 1; i <= n; i++) dp[i] = best(dp[i + 1], dp[i + 2] + a[i]);',
        'for (let i = n; i >= 1; i--) dp[i] = best(dp[i - 1], dp[i - 2] + a[i]);',
        'for (let i = 1; i <= n; i++) dp[i] = dp[i - 1] + a[i];',
      ],
      why: 'Each state depends on smaller states, so iterate upward and combine the choices (skip vs take).',
    },
  ],
  'dp-2d': [
    {
      line: 2,
      distractors: [
        '    dp[i][j] = a[i] === b[j] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);',
        '    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : 0;',
        '    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);',
      ],
      why: 'dp is 1-indexed over prefixes (hence a[i − 1]); a match extends the diagonal, a mismatch drops a character from either string. Resetting to 0 computes the longest common substring instead.',
      hint: 'longest common subsequence',
    },
  ],
  greedy: [
    {
      line: 2,
      distractors: ['if (i >= reach) return false;', 'if (a[i] === 0) return false;', 'if (i > reach) break;'],
      why: 'You are stuck only when the current index lies beyond everything reachable. A zero is fine if you can jump over it.',
    },
    {
      line: 3,
      distractors: ['reach = i + a[i];', 'reach = Math.max(reach, a[i]);', 'reach += a[i];'],
      why: 'Track the furthest point reachable from any index so far; a later short jump must not shrink it.',
    },
  ],
  'bit-manipulation': [
    {
      line: 1,
      distractors: ['for (const n of nums) x |= n;', 'for (const n of nums) x &= n;', 'for (const n of nums) x += n;'],
      why: 'XOR cancels pairs (n ^ n = 0) and 0 ^ n = n, so only the unpaired value survives.',
    },
  ],
};
