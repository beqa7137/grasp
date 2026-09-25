import { JS_DIAMETER, JS_ISLANDS, expect, seek, synced, test, trace, write } from './fixtures';

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

test('Ctrl/⌘ + Enter typed in the feedback dialog does not run the code behind it', async ({ page }) => {
  await page.goto('/code/two-sum');
  await page.getByRole('radio', { name: 'JavaScript' }).click();
  await write(page, JS_TWO_SUM);
  await page.getByRole('button', { name: 'Send feedback' }).click();
  const note = page.getByRole('textbox', { name: 'Your feedback' });
  await note.fill('The run shortcut');
  await note.press('ControlOrMeta+Enter');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog', { name: 'Send feedback' })).toBeHidden();
  // The hint gives way as soon as a run starts.
  await expect(page.getByText(/checks the examples/)).toBeVisible();
});

test('Trace steps through your own JavaScript', async ({ page }) => {
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
  await page.getByRole('link', { name: /Now write it yourself: Diameter of Binary Tree/ }).click();
  await expect(page).toHaveURL(/\/code\/tree-diameter$/);
  await expect(page.getByRole('textbox', { name: 'Diameter of Binary Tree solution' })).toBeVisible();
});
