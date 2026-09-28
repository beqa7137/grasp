import { distinctInts, randInt, shuffle } from '../../algorithms/random.js';
import { buildTree, levelOrder, type LevelOrder, type TreeNode } from '../tree.js';
import type { CodingProblemDefinition } from '../types.js';
import { distinctSorted, ints, randomTree } from './inputs.js';

const MOD = 1_000_000_007;
const INT_MIN = -(2 ** 31);
const INT_MAX = 2 ** 31 - 1;

/** The tree `shape` with `sorted` written into its nodes in order, so it is a search tree exactly when `sorted` strictly rises. */
function inorderFill(shape: LevelOrder, sorted: number[]): LevelOrder {
  const root = buildTree(shape);
  let k = 0;
  const fill = (node: TreeNode | null): void => {
    if (!node) return;
    fill(node.left);
    node.val = sorted[k++];
    fill(node.right);
  };
  fill(root);
  return levelOrder(root);
}

/** The tree `shape` with `values` written into its nodes in level order. */
function levelFill(shape: LevelOrder, values: number[]): LevelOrder {
  let k = 0;
  return shape.map((value) => (value === null ? null : values[k++]));
}

const randomWord = (rand: () => number, alphabet: string, min: number, max: number) =>
  Array.from({ length: randInt(rand, min, max) }, () => alphabet[randInt(rand, 0, alphabet.length - 1)]).join('');

export const validateBst: CodingProblemDefinition = {
  statement: [
    'Return `true` if the binary tree rooted at `root` is a valid binary search tree, and `false` otherwise.',
    "In a valid one, every value in a node's left subtree is strictly less than the node's value and every value in its right subtree is strictly greater, so no value appears twice. This holds for every node, not only for its children.",
  ],
  constraints: ['1 ≤ number of nodes ≤ 10^5', '-2^31 ≤ Node.val ≤ 2^31 - 1', 'The tree is at most 100 levels deep'],
  entry: 'isValidBst',
  params: [{ name: 'root', type: 'tree' }],
  returns: 'bool',
  compare: 'exact',
  examples: [
    { args: [[2, 1, 3]], explanation: 'The left child 1 is less than 2 and the right child 3 is greater' },
    { args: [[5, 1, 4, null, null, 3, 6]], explanation: 'The right child 4 is less than the root 5' },
    {
      args: [[5, 4, 6, null, null, 3, 7]],
      explanation: 'Each node is in order with its children, but 3 sits in the right subtree of 5 and is less than 5',
    },
  ],
  edgeCases: [
    [[7]],
    [[INT_MAX]],
    [[INT_MIN]],
    [[INT_MIN, null, INT_MAX]],
    [[INT_MAX, INT_MIN]],
    [[INT_MIN, null, INT_MIN]],
    [[2, 2]],
    [[1, null, 1]],
    [[10, 5, 15, null, null, 6, 20]],
    [[3, 1, 5, 0, 4]],
    [[4, 2, 6, 1, 3, 5, 7]],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 7);
    const sorted = rand() < 0.6 ? distinctSorted(rand, n, -3, 3) : ints(rand, n, -3, 3).sort((a, b) => a - b);
    if (rand() < 0.3) {
      const [i, j] = [randInt(rand, 0, n - 1), randInt(rand, 0, n - 1)];
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    }
    const values = sorted.map((v) => (v === -3 ? INT_MIN : v === 3 ? INT_MAX : v));
    return [inorderFill(randomTree(rand, n, 0, 0), values)];
  },
  performanceCase: (rand) => {
    const n = 100_000;
    const values = [INT_MIN, ...distinctSorted(rand, n - 2, INT_MIN + 1, INT_MAX - 1), INT_MAX];
    return [inorderFill(randomTree(rand, n, 0, 0), values)];
  },
  solve(root: TreeNode | null) {
    const valid = (node: TreeNode | null, lo: number, hi: number): boolean =>
      !node || (lo < node.val && node.val < hi && valid(node.left, lo, node.val) && valid(node.right, node.val, hi));
    return valid(root, -Infinity, Infinity);
  },
  approach:
    "Pass down the open range each subtree must stay inside: going left caps it at the node's value, and going right floors it there. Start from minus and plus infinity, not the 32-bit limits, since a node can hold either limit. Checking each node against its children alone misses a deeper node on the wrong side of an ancestor. An inorder traversal that checks the values strictly rise also works.",
  complexity: { time: 'O(n)', space: 'O(h) for a tree of height h' },
};

export const lowestCommonAncestor: CodingProblemDefinition = {
  statement: [
    'The values in the binary tree rooted at `root` are distinct, and `p` and `q` are the values of two different nodes in it. The tree is not a search tree: its values are in no particular order.',
    'Return the value of their lowest common ancestor: the deepest node that has both of them in its subtree. A node counts as part of its own subtree, so when one of them lies below the other, the answer is the upper one.',
  ],
  constraints: [
    '2 ≤ number of nodes ≤ 10^5',
    '-10^9 ≤ Node.val ≤ 10^9',
    'values are distinct',
    'p ≠ q, and both are in the tree',
    'The tree is at most 100 levels deep',
  ],
  entry: 'lowestCommonAncestor',
  params: [
    { name: 'root', type: 'tree' },
    { name: 'p', type: 'int' },
    { name: 'q', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [[3, 5, 1, 6, 2, 0, 8, null, null, 7, 4], 5, 1],
      explanation: '5 is in the left subtree of 3 and 1 in its right, so 3 is the deepest node above both',
    },
    {
      args: [[3, 5, 1, 6, 2, 0, 8, null, null, 7, 4], 5, 4],
      explanation: '4 lies below 5, and 5 counts as part of its own subtree',
    },
  ],
  edgeCases: [
    [[1, 2], 1, 2],
    [[1, 2], 2, 1],
    [[1, 2, 3, 4], 2, 4],
    [[1, null, 2, null, 3, null, 4], 4, 2],
    [[3, 5, 1, 6, 2, 0, 8, null, null, 7, 4], 7, 8],
    [[3, 5, 1, 6, 2, 0, 8, null, null, 7, 4], 6, 4],
    [[5, 9, 1, null, null, 8, 2], 8, 2],
    [[-1_000_000_000, 1_000_000_000, 0], 1_000_000_000, 0],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 2, 12);
    const values = distinctInts(rand, n, -50, 50);
    const [p, q] = shuffle(rand, values);
    return [levelFill(randomTree(rand, n, 0, 0), values), p, q];
  },
  performanceCase: (rand) => {
    const n = 100_000;
    const values = distinctInts(rand, n, -1_000_000_000, 1_000_000_000);
    return [levelFill(randomTree(rand, n, 0, 0), values), values[n - 1], values[randInt(rand, n / 2, n - 2)]];
  },
  solve(root: TreeNode, p: number, q: number) {
    const find = (node: TreeNode | null): TreeNode | null => {
      if (!node || node.val === p || node.val === q) return node;
      const left = find(node.left);
      const right = find(node.right);
      return left && right ? node : (left ?? right);
    };
    return find(root)!.val;
  },
  approach:
    'A postorder DFS returns what it found in each subtree: the node holding `p` or `q`, or null. The first node to get a hit from both sides is the answer. A node holding `p` or `q` returns itself without looking deeper, which also covers one lying below the other. Searching each subtree again for both values at every node also passes, since these trees are at most 100 levels deep, but it takes O(n·h) time.',
  complexity: { time: 'O(n)', space: 'O(h) for a tree of height h' },
};

export const rightSideView: CodingProblemDefinition = {
  statement: [
    'Imagine standing to the right of the binary tree rooted at `root`. Return the values of the nodes you can see, from top to bottom: the rightmost node on each level.',
    'A node on the left side shows when nothing on its level lies to its right. An empty tree has an empty view.',
  ],
  constraints: ['0 ≤ number of nodes ≤ 10^5', '-100 ≤ Node.val ≤ 100', 'The tree is at most 100 levels deep'],
  entry: 'rightSideView',
  params: [{ name: 'root', type: 'tree' }],
  returns: 'int[]',
  compare: 'exact',
  examples: [
    { args: [[1, 2, 3, null, 5, null, 4]], explanation: 'The rightmost nodes of the three levels are 1, 3 and 4' },
    {
      args: [[1, 2, 3, 4]],
      explanation: 'Nothing on the third level lies to the right of 4, so it shows though it hangs off the left side',
    },
  ],
  edgeCases: [[[]], [[1]], [[1, 2]], [[1, null, 3]], [[1, 2, 3, 4, null, null, null, 5]], [[1, 2, 3, null, 4, 5]], [[0, 0, 0, 0, 0]]],
  randomCase: (rand) => [randomTree(rand, randInt(rand, 1, 12), -9, 9)],
  performanceCase: (rand) => [randomTree(rand, 100_000, -100, 100)],
  solve(root: TreeNode | null) {
    const view: number[] = [];
    const visit = (node: TreeNode | null, depth: number): void => {
      if (!node) return;
      if (depth === view.length) view.push(node.val);
      visit(node.right, depth + 1);
      visit(node.left, depth + 1);
    };
    visit(root, 0);
    return view;
  },
  approach:
    'A DFS that visits the right child before the left reaches each depth first at its rightmost node, so record a node when its depth equals the number of values recorded so far. A level-order BFS that keeps the last node of each level works too. Walking down right children alone misses levels that only the left side reaches.',
  complexity: { time: 'O(n)', space: 'O(h) for a tree of height h' },
};

export const longestWordInDictionary: CodingProblemDefinition = {
  statement: [
    'Return the longest word in `words` that can be built one letter at a time from other words in `words`: every prefix of it, from its first letter up, must also be in `words`. A one-letter word needs nothing else.',
    'If several buildable words share the greatest length, return the one that comes first alphabetically. If no word can be built, return an empty string.',
  ],
  constraints: ['1 ≤ words.length ≤ 10^5', '1 ≤ words[i].length ≤ 30', 'lowercase letters', 'words are distinct'],
  entry: 'longestWord',
  params: [{ name: 'words', type: 'string[]' }],
  returns: 'string',
  compare: 'exact',
  examples: [
    {
      args: [['w', 'wo', 'wor', 'worl', 'world']],
      explanation: 'w, wo, wor and worl are all in the list, so world can be built one letter at a time',
    },
    {
      args: [['a', 'banana', 'app', 'appl', 'ap', 'apply', 'apple']],
      explanation: 'apple and apply can both be built, and apple comes first alphabetically; banana cannot, since b is missing',
    },
  ],
  edgeCases: [
    [['a']],
    [['ab']],
    [['b', 'a']],
    [['a', 'abc', 'abcd']],
    [['b', 'ab', 'abc']],
    [['ba', 'b', 'bac', 'a', 'ab', 'abd']],
    [['z', 'zy', 'zyx', 'a', 'ab']],
    [['m', 'mo', 'moo', 'mood', 'moody', 'k', 'kx', 'moodyz']],
  ],
  randomCase: (rand) => {
    const words = new Set<string>();
    const count = randInt(rand, 1, 10);
    while (words.size < count) {
      const list = [...words].filter((word) => word.length < 4);
      words.add(
        list.length && rand() < 0.6 ? list[randInt(rand, 0, list.length - 1)] + 'abc'[randInt(rand, 0, 2)] : randomWord(rand, 'abc', 1, 3),
      );
    }
    return [shuffle(rand, [...words])];
  },
  // Buildable words up to 12 letters, then as many 14 to 16 letter words that extend one of them by a letter that breaks
  // the chain: checking prefixes by scanning the list costs a full scan per long word and half a scan per found prefix.
  performanceCase: (rand) => {
    const words = new Set('abcdefghijklmnopqrst');
    const buildable = [...words];
    while (buildable.length < 50_000) {
      const parent = buildable[randInt(rand, 0, buildable.length - 1)];
      const word = parent + 'abcdefghijklmnopqrstuvwxyz'[randInt(rand, 0, 25)];
      if (parent.length < 12 && !words.has(word)) {
        words.add(word);
        buildable.push(word);
      }
    }
    const broken = new Set<string>();
    while (broken.size < 50_000) {
      const base = buildable[randInt(rand, 0, buildable.length - 1)];
      const tail = randomWord(rand, 'abcdefghijklmnopqrstuvwxyz', 14 - base.length, 16 - base.length);
      if (!words.has(base + tail[0])) broken.add(base + tail);
    }
    return [shuffle(rand, [...buildable, ...broken])];
  },
  solve(words: string[]) {
    const child = new Map<number, number>();
    const ends = new Uint8Array(words.reduce((sum, word) => sum + word.length, 1));
    let nodes = 1;
    for (const word of words) {
      let node = 0;
      for (let i = 0; i < word.length; i++) {
        const key = node * 26 + word.charCodeAt(i) - 97;
        let next = child.get(key);
        if (next === undefined) child.set(key, (next = nodes++));
        node = next;
      }
      ends[node] = 1;
    }
    let best = '';
    const visit = (node: number, word: string): void => {
      if (word.length > best.length) best = word;
      for (let letter = 0; letter < 26; letter++) {
        const next = child.get(node * 26 + letter);
        if (next !== undefined && ends[next]) visit(next, word + String.fromCharCode(97 + letter));
      }
    };
    visit(0, '');
    return best;
  },
  approach:
    'Insert every word into a trie and mark the nodes where words end. A DFS from the root that steps only into marked nodes, trying letters in alphabetical order, visits exactly the buildable words, alphabetically; keep the first word of each new greatest length. Sorting the words and keeping each one whose prefix one letter shorter was kept also works. Looking each prefix up by scanning the list is quadratic.',
  complexity: { time: 'O(total letters)', space: 'O(total letters)' },
};

export const decodeWays: CodingProblemDefinition = {
  statement: [
    'A message of capital letters was encoded by writing each letter as its position in the alphabet: A as 1, B as 2, and so on up to Z as 26. Given the digits `s`, return how many different messages could have produced it.',
    'Each letter is one or two digits with no leading zero: 06 is not F, and a 0 on its own is no letter. Return 0 if `s` cannot be decoded at all. The count can be large, so return it modulo 10^9 + 7.',
  ],
  constraints: [
    '1 ≤ s.length ≤ 10^5',
    's holds only the digits 0 to 9, and may start with 0',
    's can hold 10^5 digits, deeper than recursion allows',
  ],
  entry: 'numDecodings',
  params: [{ name: 's', type: 'string' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: ['12'], explanation: 'AB (1 2) or L (12)' },
    { args: ['226'], explanation: 'BZ (2 26), VF (22 6) or BBF (2 2 6)' },
    { args: ['06'], explanation: '0 is no letter on its own, and 06 has a leading zero' },
  ],
  edgeCases: [['0'], ['1'], ['10'], ['30'], ['100'], ['101'], ['106'], ['1006'], ['26'], ['27'], ['11106'], ['2101'], ['1'.repeat(100)]],
  randomCase: (rand) => [
    Array.from({ length: randInt(rand, 1, 12) }, () => String(rand() < 0.6 ? randInt(rand, 1, 2) : randInt(rand, 0, 9))).join(''),
  ],
  // Mostly 1s and 2s, whose count of decodings grows like the Fibonacci numbers, with zeros only right after a 1 or a 2.
  performanceCase: (rand) => {
    const pieces = ['1', '2', '12', '21', '10', '20', '26', '27', '7'];
    let s = '';
    while (s.length < 100_000) s += pieces[randInt(rand, 0, pieces.length - 1)];
    return [s.slice(0, 100_000)];
  },
  solve(s: string) {
    let before = 0;
    let last = 1;
    for (let i = 0; i < s.length; i++) {
      let ways = s[i] === '0' ? 0 : last;
      if (i > 0 && (s[i - 1] === '1' || (s[i - 1] === '2' && s[i] <= '6'))) ways += before;
      [before, last] = [last, ways % MOD];
    }
    return last;
  },
  approach:
    '`ways[i]` counts the decodings of the first `i` digits. It adds `ways[i - 1]` when the `i`-th digit is not 0, and `ways[i - 2]` when the last two digits form 10 to 26. Only the last two entries matter, so two variables do. Recursion without a memo is exponential, and a memoized one can run out of stack at 10^5 digits, so fill it bottom-up.',
  complexity: { time: 'O(n)', space: 'O(1)' },
};
