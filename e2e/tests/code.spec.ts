import type { Page } from '@playwright/test';
import { expect, synced, test } from './fixtures';

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

const JS_DIAMETER = `function diameterOfBinaryTree(root) {
  let best = 0;
  const height = (node) => {
    if (!node) return 0;
    const left = height(node.left);
    const right = height(node.right);
    best = Math.max(best, left + right);
    return 1 + Math.max(left, right);
  };
  height(root);
  return best;
}`;

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

async function write(page: Page, code: string, title = 'Two Sum') {
  const editor = page.getByRole('textbox', { name: `${title} solution` });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(code);
}

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
  await page.getByRole('radio', { name: 'JavaScript' }).click();
  await write(page, JS_TWO_SUM);
  await page.getByRole('button', { name: 'Trace' }).click();
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

test('Trace draws the input tree and marks the node being visited', async ({ page }) => {
  await page.goto('/code/tree-diameter');
  await page.getByRole('radio', { name: 'JavaScript' }).click();
  await write(page, JS_DIAMETER, 'Diameter of Binary Tree');
  await page.getByRole('button', { name: 'Trace' }).click();
  const tree = page.locator('app-trace-player g-tree-view');
  await expect(tree.getByRole('img', { name: /^Tree with \d+ nodes/ })).toBeVisible();
  for (let step = 0; step < 4; step++) await page.keyboard.press('ArrowRight');
  await expect(tree.locator('.node[data-state="active"]')).toHaveCount(1);
});

test('the tree visualizer leads to its coding problem', async ({ page }) => {
  await page.goto('/visualize/tree-traversal');
  await page.getByRole('link', { name: /Now write it yourself: Diameter of Binary Tree/ }).click();
  await expect(page).toHaveURL(/\/code\/tree-diameter$/);
  await expect(page.getByRole('textbox', { name: 'Diameter of Binary Tree solution' })).toBeVisible();
});
