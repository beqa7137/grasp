/** CPython reference solutions, used by the tests to prove the Python harness and the JS references agree. */
export const PYTHON_REFERENCE: Record<string, string> = {
  'two-sum': `
def two_sum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], i]
        seen[x] = i
`,
  'pair-sum-sorted': `
def pair_sum(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        s = nums[lo] + nums[hi]
        if s == target:
            return [lo, hi]
        if s < target:
            lo += 1
        else:
            hi -= 1
    return []
`,
  'container-most-water': `
def max_area(height):
    lo, hi, best = 0, len(height) - 1, 0
    while lo < hi:
        best = max(best, min(height[lo], height[hi]) * (hi - lo))
        if height[lo] < height[hi]:
            lo += 1
        else:
            hi -= 1
    return best
`,
  'jump-game': `
def can_jump(nums):
    reach = 0
    for i, x in enumerate(nums):
        if i > reach:
            return False
        reach = max(reach, i + x)
    return True
`,
  'longest-unique-substring': `
def length_of_longest_substring(s):
    last, start, best = {}, 0, 0
    for i, ch in enumerate(s):
        if last.get(ch, -1) >= start:
            start = last[ch] + 1
        last[ch] = i
        best = max(best, i - start + 1)
    return best
`,
  'min-size-subarray-sum': `
def min_sub_array_len(target, nums):
    best, total, lo = 0, 0, 0
    for hi, x in enumerate(nums):
        total += x
        while total >= target:
            if not best or hi - lo + 1 < best:
                best = hi - lo + 1
            total -= nums[lo]
            lo += 1
    return best
`,
  'binary-search': `
def search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
`,
  'koko-bananas': `
def min_eating_speed(piles, h):
    lo, hi = 1, max(piles)
    while lo < hi:
        mid = (lo + hi) // 2
        if sum((p + mid - 1) // mid for p in piles) <= h:
            hi = mid
        else:
            lo = mid + 1
    return lo
`,
  'daily-temperatures': `
def daily_temperatures(temperatures):
    answer, stack = [0] * len(temperatures), []
    for i, t in enumerate(temperatures):
        while stack and temperatures[stack[-1]] < t:
            j = stack.pop()
            answer[j] = i - j
        stack.append(i)
    return answer
`,
  'subarray-sum-k': `
def subarray_sum(nums, k):
    seen, total, count = {0: 1}, 0, 0
    for x in nums:
        total += x
        count += seen.get(total - k, 0)
        seen[total] = seen.get(total, 0) + 1
    return count
`,
  'number-of-islands': `
def num_islands(grid):
    rows, cols, count = len(grid), len(grid[0]), 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] != '1':
                continue
            count += 1
            stack = [(r, c)]
            grid[r][c] = '0'
            while stack:
                y, x = stack.pop()
                for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= ny < rows and 0 <= nx < cols and grid[ny][nx] == '1':
                        grid[ny][nx] = '0'
                        stack.append((ny, nx))
    return count
`,
  'rotting-oranges': `
def oranges_rotting(grid):
    rows, cols = len(grid), len(grid[0])
    rotten = [(r, c) for r in range(rows) for c in range(cols) if grid[r][c] == 2]
    fresh = sum(row.count(1) for row in grid)
    minutes = 0
    while fresh and rotten:
        next_rotten = []
        for r, c in rotten:
            for y, x in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                if 0 <= y < rows and 0 <= x < cols and grid[y][x] == 1:
                    grid[y][x] = 2
                    fresh -= 1
                    next_rotten.append((y, x))
        rotten = next_rotten
        minutes += 1
    return -1 if fresh else minutes
`,
  subsets: `
def subsets(nums):
    nums = sorted(nums)
    out, path = [], []

    def go(i):
        if i == len(nums):
            out.append(path[:])
            return
        path.append(nums[i])
        go(i + 1)
        path.pop()
        go(i + 1)

    go(0)
    return out
`,
  'merge-intervals': `
def merge(intervals):
    out = []
    for start, end in sorted(intervals):
        if out and start <= out[-1][1]:
            out[-1][1] = max(out[-1][1], end)
        else:
            out.append([start, end])
    return out
`,
  'top-k-frequent': `
import heapq
from collections import Counter

def top_k_frequent(nums, k):
    return [v for v, _ in heapq.nlargest(k, Counter(nums).items(), key=lambda kv: kv[1])]
`,
  'house-robber': `
def rob(nums):
    take = skip = 0
    for x in nums:
        take, skip = skip + x, max(take, skip)
    return max(take, skip)
`,
  'coin-change': `
def coin_change(coins, amount):
    fewest = [0] + [float('inf')] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and fewest[a - c] + 1 < fewest[a]:
                fewest[a] = fewest[a - c] + 1
    return -1 if fewest[amount] == float('inf') else fewest[amount]
`,
  'kth-largest-element': `
import heapq

def find_kth_largest(nums, k):
    heap = nums[:k]
    heapq.heapify(heap)
    for x in nums[k:]:
        if x > heap[0]:
            heapq.heapreplace(heap, x)
    return heap[0]
`,
  'longest-common-subsequence': `
def longest_common_subsequence(text1, text2):
    prev = [0] * (len(text2) + 1)
    for a in text1:
        row = [0]
        for j, b in enumerate(text2):
            row.append(prev[j] + 1 if a == b else max(prev[j + 1], row[j]))
        prev = row
    return prev[-1]
`,
  'count-components': `
def count_components(n, edges):
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    components = n
    for a, b in edges:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
            components -= 1
    return components
`,
  'redundant-connection': `
def find_redundant_connection(edges):
    parent = list(range(len(edges) + 1))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b in edges:
        ra, rb = find(a), find(b)
        if ra == rb:
            return [a, b]
        parent[ra] = rb
    return []
`,
  'course-schedule': `
from collections import deque

def can_finish(num_courses, prerequisites):
    indeg = [0] * num_courses
    adj = [[] for _ in range(num_courses)]
    for a, b in prerequisites:
        adj[b].append(a)
        indeg[a] += 1
    queue = deque(v for v in range(num_courses) if indeg[v] == 0)
    taken = 0
    while queue:
        u = queue.popleft()
        taken += 1
        for v in adj[u]:
            indeg[v] -= 1
            if indeg[v] == 0:
                queue.append(v)
    return taken == num_courses
`,
  'network-delay': `
import heapq

def network_delay_time(times, n, k):
    adj = [[] for _ in range(n + 1)]
    for u, v, w in times:
        adj[u].append((v, w))
    dist = [float('inf')] * (n + 1)
    dist[k] = 0
    heap = [(0, k)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]:
            continue
        for v, w in adj[u]:
            if d + w < dist[v]:
                dist[v] = d + w
                heapq.heappush(heap, (dist[v], v))
    worst = max(dist[1:])
    return -1 if worst == float('inf') else worst
`,
  'count-prefixes': `
def count_prefixes(words, prefixes):
    root = {}
    for word in words:
        node = root
        for ch in word:
            node = node.setdefault(ch, {'#': 0})
            node['#'] += 1
    out = []
    for prefix in prefixes:
        node = root
        for ch in prefix:
            node = node.get(ch)
            if node is None:
                break
        out.append(node['#'] if node else 0)
    return out
`,
  'find-duplicate': `
def find_duplicate(nums):
    slow, fast = nums[0], nums[nums[0]]
    while slow != fast:
        slow, fast = nums[slow], nums[nums[fast]]
    slow = 0
    while slow != fast:
        slow, fast = nums[slow], nums[fast]
    return slow
`,
  'tree-diameter': `
def diameter_of_binary_tree(root):
    best = 0

    def height(node):
        nonlocal best
        if not node:
            return 0
        left, right = height(node.left), height(node.right)
        best = max(best, left + right)
        return 1 + max(left, right)

    height(root)
    return best
`,
  'house-robber-tree': `
def rob(root):
    def dfs(node):
        if not node:
            return 0, 0
        rob_left, skip_left = dfs(node.left)
        rob_right, skip_right = dfs(node.right)
        return node.val + skip_left + skip_right, max(rob_left, skip_left) + max(rob_right, skip_right)

    return max(dfs(root))
`,
  'single-number': `
def single_number(nums):
    x = 0
    for n in nums:
        x ^= n
    return x
`,
  'total-hamming-distance': `
def total_hamming_distance(nums):
    total = 0
    for bit in range(30):
        ones = sum((x >> bit) & 1 for x in nums)
        total += ones * (len(nums) - ones)
    return total
`,
};
