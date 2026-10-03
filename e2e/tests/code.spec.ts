import type { Locator } from '@playwright/test';
import { JS_DIAMETER, JS_ISLANDS, expect, expectUnmoved, seek, stepTotal, synced, test, trace, viewportTop, write } from './fixtures';

const JS_TWO_SUM = `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];
    seen.set(nums[i], i);
  }
}`;

const JS_TWO_SUM_QUADRATIC = `function twoSum(nums, target) {
  for (let i = 0; i < nums.length; i++)
    for (let j = i + 1; j < nums.length; j++) if (nums[i] + nums[j] === target) return [i, j];
}`;

const PY_TWO_SUM = `def two_sum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], i]
        seen[x] = i`;

const TS_DIAMETER = `interface TreeNode {
  val: number;
  left: TreeNode | null;
  right: TreeNode | null;
}

function diameterOfBinaryTree(root: TreeNode | null): number {
  let best = 0;
  function height(node: TreeNode | null): number {
    if (!node) return 0;
    const left = height(node.left);
    const right = height(node.right);
    best = Math.max(best, left + right);
    return 1 + Math.max(left, right);
  }
  height(root);
  return best;
}`;

const PY_DIAMETER = `# TreeNode (val, left, right) and Optional are predefined; left and right are a TreeNode or None

def diameter_of_binary_tree(root: Optional[TreeNode]) -> int:
    best = 0

    def height(node: Optional[TreeNode]) -> int:
        nonlocal best
        if not node:
            return 0
        left, right = height(node.left), height(node.right)
        best = max(best, left + right)
        return 1 + max(left, right)

    height(root)
    return best`;

const JS_DIAMETER_LONG_NAME = `function diameterOfBinaryTree(root) {
  let best = 0;
  function depth(currentNode) {
    if (!currentNode) return 0;
    const leftDepth = depth(currentNode.left);
    const rightDepth = depth(currentNode.right);
    best = Math.max(best, leftDepth + rightDepth);
    return 1 + Math.max(leftDepth, rightDepth);
  }
  depth(root);
  return best;
}`;

const JS_INORDER_LONG_NAMES = `function diameterOfBinaryTree(root) {
  const stack = [];
  let current_node = root;
  let previous_node = null;
  while (current_node || stack.length) {
    while (current_node) {
      stack.push(current_node);
      current_node = current_node.left;
    }
    current_node = stack.pop();
    previous_node = current_node;
    current_node = current_node.right;
  }
  return 0;
}`;

const JS_MERGE = `function merge(intervals) {
  intervals.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of intervals) {
    if (out.length && out[out.length - 1][1] >= s) out[out.length - 1][1] = Math.max(out[out.length - 1][1], e);
    else out.push([s, e]);
  }
  return out;
}`;

const JS_REVERSE = `function reverseList(head) {
  let prev = null;
  let curr = head;
  while (curr) {
    const next = curr.next;
    curr.next = prev;
    prev = curr;
    curr = next;
  }
  return prev;
}`;

const PY_REVERSE_BETWEEN = `def reverse_between(head: Optional[ListNode], left: int, right: int) -> Optional[ListNode]:
    dummy = ListNode(0, head)
    before = dummy
    for _ in range(left - 1):
        before = before.next
    prev, curr = None, before.next
    for _ in range(right - left + 1):
        curr.next, prev, curr = prev, curr, curr.next
    before.next.next = curr
    before.next = prev
    return dummy.next`;

const PY_PALINDROME_COPY = `def is_palindrome(head: Optional[ListNode]) -> bool:
    rev, node = None, head
    while node:
        rev = ListNode(node.val, rev)
        node = node.next
    while head:
        if head.val != rev.val:
            return False
        head, rev = head.next, rev.next
    return True`;

const JS_KRUSKAL = `function minimumCost(n, connections) {
  const parent = Array.from({ length: n + 1 }, (_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  let total = 0;
  let used = 0;
  for (const [x, y, cost] of [...connections].sort((a, b) => a[2] - b[2])) {
    const [rx, ry] = [find(x), find(y)];
    if (rx === ry) continue;
    parent[rx] = ry;
    total += cost;
    if (++used === n - 1) return total;
  }
  return -1;
}`;

const PY_PRIM_POINTS = `def min_cost_connect_points(points: list[list[int]]) -> int:
    n = len(points)
    dist = [float('inf')] * n
    dist[0] = 0
    in_tree = [False] * n
    total = 0
    for _ in range(n):
        u = -1
        for j in range(n):
            if not in_tree[j] and (u < 0 or dist[j] < dist[u]):
                u = j
        in_tree[u] = True
        total += dist[u]
        x, y = points[u]
        for j in range(n):
            if not in_tree[j]:
                dist[j] = min(dist[j], abs(x - points[j][0]) + abs(y - points[j][1]))
    return total`;

const JS_PARTITION = `function canPartitionKSubsets(nums, k) {
  const total = nums.reduce((a, b) => a + b, 0);
  if (total % k) return false;
  const target = total / k;
  const n = nums.length;
  const fill = new Array(1 << n).fill(-1);
  fill[0] = 0;
  for (let mask = 0; mask < 1 << n; mask++) {
    if (fill[mask] < 0) continue;
    for (let j = 0; j < n; j++)
      if ((mask & (1 << j)) === 0 && fill[mask] + nums[j] <= target) fill[mask | (1 << j)] = (fill[mask] + nums[j]) % target;
  }
  return fill[(1 << n) - 1] === 0;
}`;

const PY_HATS = `def number_ways(hats: list[list[int]]) -> int:
    mod = 10**9 + 7
    n = len(hats)
    liked = [set(h) for h in hats]
    ways = [0] * (1 << n)
    ways[0] = 1
    for hat in range(1, 41):
        before = ways[:]
        for mask in range(1 << n):
            if before[mask]:
                for p in range(n):
                    if not mask & (1 << p) and hat in liked[p]:
                        ways[mask | (1 << p)] = (ways[mask | (1 << p)] + before[mask]) % mod
    return ways[-1]`;

/** A nest of lists far deeper than Pyodide's stack can free, which kills its interpreter. */
const PY_CRASH = `def two_sum(nums, target):
    x = []
    for i in range(100000):
        x = [x]
    return [0, 1]`;

test('an efficient JavaScript solution passes the examples, then every test', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/code/two-sum');
  await page.getByRole('radio', { name: 'JavaScript' }).click();
  await write(page, JS_TWO_SUM);

  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('3 / 3 examples passed')).toBeVisible();

  const sync = synced(page, 'code.submitted');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText(/^(\d+) \/ \1 tests passed$/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Accepted.')).toBeVisible();
  await sync;
});

test('a correct but quadratic solution fails the performance test', async ({ page }) => {
  await page.goto('/code/two-sum');
  await page.getByRole('radio', { name: 'JavaScript' }).click();
  await write(page, JS_TWO_SUM_QUADRATIC);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('3 / 3 examples passed')).toBeVisible();
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText(/^\d+ \/ \d+ tests passed$/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Accepted.')).toBeHidden();
});

test('Python runs in the browser on Pyodide', { tag: '@smoke' }, async ({ page }) => {
  test.slow();
  await page.goto('/code/two-sum');
  await expect(page.getByRole('radio', { name: 'Python' })).toBeChecked();
  await write(page, PY_TWO_SUM);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('3 / 3 examples passed')).toBeVisible({ timeout: 60_000 });
});

test('Ctrl/⌘ + Enter runs the examples straight from the editor', async ({ page }) => {
  await page.goto('/code/two-sum');
  await page.getByRole('radio', { name: 'JavaScript' }).click();
  await write(page, JS_TWO_SUM);
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.getByText('3 / 3 examples passed')).toBeVisible();
});

test('in Python, Trace explains itself and offers JavaScript, keeping the Python draft', async ({ page }) => {
  await page.goto('/code/two-sum');
  await expect(page.getByRole('radio', { name: 'Python' })).toBeChecked();
  await write(page, PY_TWO_SUM);
  await page.getByRole('button', { name: 'Trace', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Trace' })).toHaveAttribute('aria-selected', 'true');
  const note = page.locator('p', { hasText: 'Trace steps through JavaScript or TypeScript code.' });
  await expect(note).toBeFocused();
  await expect(note).toContainText('Your Python draft stays saved.');

  await note.getByRole('button', { name: 'Switch to JavaScript' }).click();
  await expect(page.getByRole('radio', { name: 'JavaScript' })).toBeChecked();
  const editor = page.getByRole('textbox', { name: 'Two Sum solution' });
  await expect(editor).not.toContainText('enumerate(nums)');
  await page.getByRole('radio', { name: 'Python' }).click();
  await expect(editor).toContainText('for i, x in enumerate(nums):');
});

test('Trace steps through your own JavaScript', { tag: '@player' }, async ({ page }) => {
  await page.goto('/code/two-sum');
  await trace(page, JS_TWO_SUM);
  await expect(page.getByRole('tab', { name: 'Trace' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('slider', { name: 'Timeline' })).toBeVisible();
  const count = page.locator('app-trace-player .count');
  await expect(count).toHaveText(/^1 \/ \d+$/);
  await page.keyboard.press('ArrowRight');
  await expect(count).toHaveText(/^2 \/ \d+$/);
});

test('a tree problem builds each input tree from its level order and accepts a TypeScript DFS', async ({ page }) => {
  await page.goto('/code/tree-diameter');
  await expect(page.locator('.example g-tree-view')).toHaveCount(3);
  await page.getByRole('radio', { name: 'TypeScript' }).click();
  await write(page, TS_DIAMETER, 'Diameter of Binary Tree');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('3 / 3 examples passed')).toBeVisible();

  const sync = synced(page, 'code.submitted');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText(/^(\d+) \/ \1 tests passed$/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Accepted.')).toBeVisible();
  await sync;
});

test('Python has TreeNode and Optional in scope for a tree problem', async ({ page }) => {
  test.slow();
  await page.goto('/code/tree-diameter');
  await write(page, PY_DIAMETER, 'Diameter of Binary Tree');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('3 / 3 examples passed')).toBeVisible({ timeout: 60_000 });
});

test('a list problem hands the list over as linked nodes and accepts an in-place JavaScript reversal', async ({ page }) => {
  await page.goto('/code/reverse-linked-list');
  await page.getByRole('radio', { name: 'JavaScript' }).click();
  await write(page, JS_REVERSE, 'Reverse Linked List');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('3 / 3 examples passed')).toBeVisible();

  const sync = synced(page, 'code.submitted');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText(/^(\d+) \/ \1 tests passed$/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Accepted.')).toBeVisible();
  await sync;
});

test('Python has ListNode in scope for a list problem, and a list of 200,000 nodes does not crash it', async ({ page }) => {
  test.slow();
  await page.goto('/code/reverse-linked-list-ii');
  await write(page, PY_REVERSE_BETWEEN, 'Reverse Linked List II');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText(/^(\d+) \/ \1 tests passed$/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('Accepted.')).toBeVisible();
});

test('a Python solution that builds its own 200,000-node copy of a list, never returned, does not crash it', async ({ page }) => {
  test.slow();
  await page.goto('/code/palindrome-linked-list');
  await write(page, PY_PALINDROME_COPY, 'Palindrome Linked List');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText(/^(\d+) \/ \1 tests passed$/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('Accepted.')).toBeVisible();
});

test('Trace shows each list variable as the values it leads to, and the list it returns', async ({ page }) => {
  await page.goto('/code/reverse-linked-list');
  await trace(page, JS_REVERSE, 'Reverse Linked List');
  const count = page.locator('app-trace-player .count');
  await expect(count).toHaveText(/^1 \/ \d+$/);
  await expect(page.locator('app-trace-player .narration')).toContainText('head = 1 → 2 → 3 → 4 → 5');
  await seek(page, (await stepTotal(count)) - 1, 'Returned 5 → 4 → 3 → 2 → 1');
});

test('a JavaScript Kruskal with union-find is accepted for Connecting Cities, 100,000 roads included', async ({ page }) => {
  await page.goto('/code/connecting-cities');
  await page.getByRole('radio', { name: 'JavaScript' }).click();
  await write(page, JS_KRUSKAL, 'Connecting Cities With Minimum Cost');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText(/^(\d+) \/ \1 tests passed$/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Accepted.')).toBeVisible();
});

test('a Python Prim with an array of distances is accepted for Min Cost to Connect All Points, 1,000 points included', async ({ page }) => {
  test.slow();
  await page.goto('/code/min-cost-connect-points');
  await write(page, PY_PRIM_POINTS, 'Min Cost to Connect All Points');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText(/^(\d+) \/ \1 tests passed$/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('Accepted.')).toBeVisible();
});

test('a JavaScript bitmask DP is accepted for Partition to K Equal Sum Subsets, 16 values included', async ({ page }) => {
  await page.goto('/code/partition-k-subsets');
  await page.getByRole('radio', { name: 'JavaScript' }).click();
  await write(page, JS_PARTITION, 'Partition to K Equal Sum Subsets');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText(/^(\d+) \/ \1 tests passed$/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Accepted.')).toBeVisible();
});

test('a Python DP over hats with a mask of people is accepted for the hats problem, ten people included', async ({ page }) => {
  test.slow();
  await page.goto('/code/hats-to-people');
  await write(page, PY_HATS, 'Number of Ways to Wear Different Hats to Each Other');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText(/^(\d+) \/ \1 tests passed$/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('Accepted.')).toBeVisible();
});

test.describe('when Python code crashes the interpreter', () => {
  // Pyodide logs its crash from the worker. One regex: Playwright reads a second array item as fixture options.
  test.use({ expectedConsoleErrors: [/Pyodide has suffered a fatal error|The cause of the fatal error|Maximum call stack size exceeded/] });

  test('the run says so, and the next run starts a fresh Python', async ({ page }) => {
    test.slow();
    await page.goto('/code/two-sum');
    await write(page, PY_CRASH);
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByText(/^Python crashed/)).toBeVisible({ timeout: 60_000 });

    await write(page, PY_TWO_SUM);
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByText('3 / 3 examples passed')).toBeVisible({ timeout: 60_000 });
  });
});

test('Trace draws the input tree and marks the node being visited', async ({ page }) => {
  await page.goto('/code/tree-diameter');
  await trace(page, JS_DIAMETER, 'Diameter of Binary Tree');
  const tree = page.locator('app-trace-player g-tree-view');
  await expect(tree.getByRole('img', { name: /^Tree with \d+ nodes/ })).toBeVisible();
  for (let step = 0; step < 4; step++) await page.keyboard.press('ArrowRight');
  await expect(tree.locator('.node[data-state="active"]')).toHaveCount(1);
});

test('Trace shows the call stack of a recursive DFS, and the calls waiting on the stack in the tree', async ({ page }) => {
  await page.goto('/code/tree-diameter');
  await trace(page, JS_DIAMETER, 'Diameter of Binary Tree');
  await seek(page, 7, 'Called height(TreeNode(4))');
  await expect(page.getByRole('list', { name: 'call stack' }).getByRole('listitem')).toHaveText([
    'diameterOfBinaryTree(TreeNode(1))',
    'height(TreeNode(1))',
    'height(TreeNode(2))',
    'height(TreeNode(4))',
  ]);
  const tree = page.locator('app-trace-player g-tree-view');
  await expect(tree.getByRole('img', { name: 'Tree with 5 nodes, current node 4, 2 on the call stack' })).toBeVisible();
  await expect(tree.locator('.legend')).toContainText('on the call stack');

  await seek(page, 16, 'Back in height(TreeNode(2)) · left = 1');
  await expect(tree.getByRole('img', { name: 'Tree with 5 nodes, current node 2, 1 on the call stack, 1 returned' })).toBeVisible();
});

/**
 * Every line of the badge lies inside the drawing: its words, measured from where the glyphs start and end, since a
 * rendered box for a text or a line of it also takes in its outline, and WebKit's takes in more of it than Chromium's.
 */
async function expectWordsInside(badge: Locator) {
  const lines = await badge.evaluate((text: SVGTextElement) => {
    const view = text.ownerSVGElement!.viewBox.baseVal;
    return [...text.querySelectorAll('tspan')].map((line) => ({
      start: line.getStartPositionOfChar(0).x,
      end: line.getEndPositionOfChar(line.getNumberOfChars() - 1).x,
      left: view.x,
      right: view.x + view.width,
    }));
  });
  for (const { start, end, left, right } of lines) {
    expect(start).toBeGreaterThanOrEqual(left);
    expect(end).toBeLessThanOrEqual(right);
  }
}

test('Trace keeps the tree one width as a long pointer name comes and goes, with its badge inside the tree', async ({ page }) => {
  await page.goto('/code/tree-diameter');
  await trace(page, JS_DIAMETER_LONG_NAME, 'Diameter of Binary Tree');
  const tree = page.locator('app-trace-player g-tree-view svg');
  const unbadged = await tree.getAttribute('viewBox');
  await seek(page, 4, 'Called depth(TreeNode(2))');
  const badge = tree.locator('text.badge');
  await expect(badge).toHaveText('currentNode');
  expect(await tree.getAttribute('viewBox')).toBe(unbadged);
  await expectWordsInside(badge);
});

test('on a narrow phone, two long pointer names on one node stack on two lines, and the tree keeps its full size', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/code/tree-diameter');
  await trace(page, JS_INORDER_LONG_NAMES, 'Diameter of Binary Tree');
  const tree = page.locator('app-trace-player g-tree-view svg');
  const first = (await tree.getAttribute('viewBox'))!;
  await seek(page, 13, 'previous_node = TreeNode(4)');
  const badge = tree.locator('text.badge');
  await expect(badge.locator('tspan')).toHaveText(['current_node,', 'previous_node']);
  expect(await tree.getAttribute('viewBox')).toBe(first);
  expect((await tree.boundingBox())!.width).toBeCloseTo(Number(first.split(' ')[2]), 0);
  await expectWordsInside(badge);
});

test('on a narrow phone, a call too long for the call stack is cut short on one line, and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/code/tree-diameter');
  await trace(page, JS_DIAMETER, 'Diameter of Binary Tree');
  await seek(page, 7, 'Called height(TreeNode(4))');
  const calls = page.getByRole('list', { name: 'call stack' }).getByRole('listitem');
  await expect(calls.first()).toHaveText('diameterOfBinaryTree(TreeNode(1))');
  const heights = await calls.evaluateAll((items) => items.map((item) => (item as HTMLElement).offsetHeight));
  expect(new Set(heights).size).toBe(1);
  const viz = page.locator('app-trace-player .viz');
  expect(await viz.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
});

test(
  'Step forward stays under the finger through a whole trace, as the call stack grows and shrinks',
  { tag: '@player' },
  async ({ page }) => {
    await page.goto('/code/tree-diameter');
    await trace(page, JS_DIAMETER, 'Diameter of Binary Tree');
    const player = page.locator('app-trace-player');
    const forward = player.getByRole('button', { name: 'Step forward' });
    const count = player.locator('.count');
    await forward.scrollIntoViewIfNeeded();
    const home = await viewportTop(forward);
    const total = await stepTotal(count);
    for (let step = 2; step <= total; step++) {
      await forward.click();
      await expect(count).toHaveText(`${step} / ${total}`);
      await expectUnmoved(forward, home, `Step forward at step ${step}`);
    }
  },
);

test('widening the window mid-trace, from one column back to two, leaves Step forward where it was', async ({ page, isMobile }) => {
  test.skip(isMobile, 'A desktop window.');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/code/tree-diameter');
  await trace(page, JS_DIAMETER, 'Diameter of Binary Tree');
  const player = page.locator('app-trace-player');
  const forward = player.getByRole('button', { name: 'Step forward' });
  const count = player.locator('.count');
  const total = await stepTotal(count);
  for (let step = 2; step <= 7; step++) {
    await forward.click();
    await expect(count).toHaveText(`${step} / ${total}`);
  }
  await page.setViewportSize({ width: 700, height: 720 });
  await forward.evaluate((button) => button.scrollIntoView({ block: 'center' }));
  const home = await viewportTop(forward);
  await page.setViewportSize({ width: 1280, height: 720 });
  // The trace takes up its new width a frame after the window does.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await expectUnmoved(forward, home, 'Step forward in the wider window');
});

test('with the page scrolled to its end, Step forward stays put as the call stack unwinds and the drawing shrinks', async ({
  page,
  isMobile,
}) => {
  // On a laptop the problem statement beside the trace also sets where the page ends, so the page gives back less than the
  // drawing does. A phone is given the height of a large one, where Step forward is still on screen at the page end.
  await page.setViewportSize(isMobile ? { width: page.viewportSize()!.width, height: 840 } : { width: 1280, height: 1000 });
  await page.goto('/code/tree-diameter');
  await trace(page, JS_DIAMETER, 'Diameter of Binary Tree');
  const player = page.locator('app-trace-player');
  const forward = player.getByRole('button', { name: 'Step forward' });
  const count = player.locator('.count');
  await player.getByRole('slider', { name: 'Timeline' }).fill('17');
  await expect(player.locator('g-list-view.calls .item')).toHaveCount(4);
  await page.locator('ion-content', { has: player }).evaluate((content) => {
    const scroller = content.shadowRoot!.querySelector('.inner-scroll')!;
    scroller.scrollTop = scroller.scrollHeight;
  });
  const home = await viewportTop(forward);
  const total = await stepTotal(count);
  for (let step = 19; step <= total; step++) {
    await forward.click();
    await expect(count).toHaveText(`${step} / ${total}`);
    await expectUnmoved(forward, home, `Step forward at step ${step}`);
  }
});

test('on a laptop scrolled to the page end, stepping a trace from the keyboard leaves the problem statement beside it where it is', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'The problem statement sits above the trace on a phone.');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/code/tree-diameter');
  await trace(page, JS_DIAMETER, 'Diameter of Binary Tree');
  const player = page.locator('app-trace-player');
  const count = player.locator('.count');
  const total = await stepTotal(count);
  await page.locator('ion-content', { has: player }).evaluate((content) => {
    const scroller = content.shadowRoot!.querySelector('.inner-scroll')!;
    scroller.scrollTop = scroller.scrollHeight;
  });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const constraints = page.locator('.problem .constraints');
  const home = await viewportTop(constraints);
  for (let step = 2; step <= total; step++) {
    await page.keyboard.press('ArrowRight');
    await expect(count).toHaveText(`${step} / ${total}`);
    await expectUnmoved(constraints, home, `the constraints after step ${step}`);
  }
});

test('the call stack keeps no empty room above its calls for deeper frames still to come', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/code/tree-diameter');
  await trace(page, JS_DIAMETER, 'Diameter of Binary Tree');
  const stack = page.locator('app-trace-player g-list-view.calls');
  const calls = stack.getByRole('listitem');
  // Layout offsets, not client rects: each call pops in from 70% scale, and a scaled box's rect sits lower until it ends.
  const gapUnderLabel = () =>
    stack.evaluate((list) => {
      const top = (el: Element) => {
        let y = 0;
        for (let node = el as HTMLElement | null; node && node !== list; node = node.offsetParent as HTMLElement | null)
          y += node.offsetTop;
        return y;
      };
      const label = list.querySelector<HTMLElement>('.label')!;
      return Math.min(...[...list.querySelectorAll('.item')].map(top)) - (top(label) + label.offsetHeight);
    });
  await expect(calls).toHaveCount(1);
  const oneDeep = await gapUnderLabel();
  await seek(page, 7, 'Called height(TreeNode(4))');
  await expect(calls).toHaveCount(4);
  expect(Math.abs((await gapUnderLabel()) - oneDeep), 'the top call sits as far under the label one call deep as four').toBeLessThan(1);
});

test('a trace of pairs gives each value a cell wide enough for it, over its own index', async ({ page }) => {
  await page.goto('/code/merge-intervals');
  await trace(page, JS_MERGE, 'Merge Intervals');
  const array = page.locator('app-trace-player g-array-view');
  await expect(array.locator('.cell').first()).toHaveText('[1, 3]');
  const misplaced = await array.evaluate((view) => {
    const indices = [...view.querySelectorAll('.indices span')].map((index) => index.getBoundingClientRect());
    return [...view.querySelectorAll('.cells .cell')].flatMap((cell, i) => {
      const box = cell.getBoundingClientRect();
      const text = cell.querySelector('.val')!.getBoundingClientRect();
      const fits = text.left >= box.left + 1 && text.right <= box.right - 1;
      const centred = Math.abs(box.left + box.width / 2 - (indices[i].left + indices[i].width / 2)) < 1;
      return fits && centred ? [] : [cell.textContent!.trim()];
    });
  });
  expect(misplaced, 'values spilling out of their cells, or cells off their index').toEqual([]);
});

test('a trace that calls nothing beyond the entry function has no call stack', async ({ page }) => {
  await page.goto('/code/two-sum');
  await trace(page, JS_TWO_SUM);
  await expect(page.getByRole('slider', { name: 'Timeline' })).toBeVisible();
  await expect(page.locator('app-trace-player g-array-view')).toBeVisible();
  await expect(page.locator('app-trace-player').getByText('call stack')).toHaveCount(0);
});

test('Trace draws a grid input as a grid, with the cell (r, c) points at and the land the code sank', async ({ page }) => {
  await page.goto('/code/number-of-islands');
  await trace(page, JS_ISLANDS, 'Number of Islands');
  await seek(page, 12, 'grid[1][0] = "0"');
  const grid = page.locator('app-trace-player g-table-view');
  await expect(grid.getByRole('table', { name: 'Table with 4 rows and 5 columns, current cell row 1 column 0' })).toBeVisible();
  await expect(grid.locator('.cell[data-role="path"]')).toHaveCount(1);
  await expect(page.locator('app-trace-player g-array-view')).toHaveCount(0);
  await expect(grid.locator('g-legend')).toContainText('changed by your code');
});

test('the tree visualizer leads to its coding problem', async ({ page }) => {
  await page.goto('/visualize/tree-traversal');
  await page.getByRole('button', { name: 'About this visualizer' }).click();
  await page.getByRole('link', { name: /Now write it yourself: Diameter of Binary Tree/ }).click();
  await expect(page).toHaveURL(/\/code\/tree-diameter$/);
  await expect(page.getByRole('textbox', { name: 'Diameter of Binary Tree solution' })).toBeVisible();
});
