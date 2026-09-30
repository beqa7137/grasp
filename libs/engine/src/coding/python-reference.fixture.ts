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
  'longest-consecutive-sequence': `
def longest_consecutive(nums):
    values = set(nums)
    best = 0
    for x in values:
        if x - 1 not in values:
            end = x
            while end + 1 in values:
                end += 1
            best = max(best, end - x + 1)
    return best
`,
  'four-sum-count': `
from collections import Counter

def four_sum_count(nums1, nums2, nums3, nums4):
    pair_sums = Counter(a + b for a in nums1 for b in nums2)
    return sum(pair_sums[-c - d] for c in nums3 for d in nums4)
`,
  'valid-sudoku': `
def is_valid_sudoku(board):
    seen = set()
    for r, row in enumerate(board):
        for c, digit in enumerate(row):
            if digit == '.':
                continue
            keys = [(digit, 'row', r), (digit, 'col', c), (digit, 'box', r // 3, c // 3)]
            if any(key in seen for key in keys):
                return False
            seen.update(keys)
    return True
`,
  'group-anagrams': `
from collections import defaultdict

def group_anagrams(strs):
    groups = defaultdict(list)
    for word in strs:
        groups[''.join(sorted(word))].append(word)
    return [' '.join(sorted(group)) for group in groups.values()]
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
  'three-sum': `
def three_sum(nums):
    nums = sorted(nums)
    triplets = []
    for i in range(len(nums) - 2):
        if nums[i] > 0:
            break
        if i and nums[i] == nums[i - 1]:
            continue
        lo, hi = i + 1, len(nums) - 1
        while lo < hi:
            total = nums[i] + nums[lo] + nums[hi]
            if total < 0:
                lo += 1
            elif total > 0:
                hi -= 1
            else:
                triplets.append([nums[i], nums[lo], nums[hi]])
                while lo < hi and nums[lo] == nums[lo + 1]:
                    lo += 1
                lo += 1
                hi -= 1
    return triplets
`,
  'trapping-rain-water': `
def trap(height):
    lo, hi = 0, len(height) - 1
    left_max = right_max = water = 0
    while lo < hi:
        if height[lo] < height[hi]:
            left_max = max(left_max, height[lo])
            water += left_max - height[lo]
            lo += 1
        else:
            right_max = max(right_max, height[hi])
            water += right_max - height[hi]
            hi -= 1
    return water
`,
  'boats-to-save-people': `
def num_rescue_boats(people, limit):
    people = sorted(people)
    lo, hi, boats = 0, len(people) - 1, 0
    while lo <= hi:
        if people[lo] + people[hi] <= limit:
            lo += 1
        hi -= 1
        boats += 1
    return boats
`,
  'sort-colors': `
def sort_colors(nums):
    lo, mid, hi = 0, 0, len(nums) - 1
    while mid <= hi:
        if nums[mid] == 0:
            nums[lo], nums[mid] = nums[mid], nums[lo]
            lo += 1
            mid += 1
        elif nums[mid] == 2:
            nums[mid], nums[hi] = nums[hi], nums[mid]
            hi -= 1
        else:
            mid += 1
    return nums
`,
  'squares-of-sorted-array': `
def sorted_squares(nums):
    out = [0] * len(nums)
    lo, hi = 0, len(nums) - 1
    for k in range(len(nums) - 1, -1, -1):
        if abs(nums[lo]) > abs(nums[hi]):
            out[k] = nums[lo] * nums[lo]
            lo += 1
        else:
            out[k] = nums[hi] * nums[hi]
            hi -= 1
    return out
`,
  'valid-palindrome-ii': `
def valid_palindrome(s):
    lo, hi = 0, len(s) - 1
    while lo < hi:
        if s[lo] != s[hi]:
            a, b = s[lo + 1 : hi + 1], s[lo:hi]
            return a == a[::-1] or b == b[::-1]
        lo += 1
        hi -= 1
    return True
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
  'gas-station': `
def can_complete_circuit(gas, cost):
    total = tank = start = 0
    for i, (g, c) in enumerate(zip(gas, cost)):
        total += g - c
        tank += g - c
        if tank < 0:
            start, tank = i + 1, 0
    return start if total >= 0 else -1
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
  'character-replacement': `
def character_replacement(s, k):
    counts = {}
    most = best = lo = 0
    for hi, ch in enumerate(s):
        counts[ch] = counts.get(ch, 0) + 1
        most = max(most, counts[ch])
        while hi - lo + 1 - most > k:
            counts[s[lo]] -= 1
            lo += 1
        best = max(best, hi - lo + 1)
    return best
`,
  'permutation-in-string': `
from collections import Counter

def check_inclusion(s1, s2):
    m = len(s1)
    if m > len(s2):
        return False
    need, window = Counter(s1), Counter(s2[:m])
    if window == need:
        return True
    for i in range(m, len(s2)):
        window[s2[i]] += 1
        window[s2[i - m]] -= 1
        if window[s2[i - m]] == 0:
            del window[s2[i - m]]
        if window == need:
            return True
    return False
`,
  'minimum-window-substring': `
from collections import Counter

def min_window(s, t):
    need = Counter(t)
    missing = len(t)
    best_start, best_len = 0, float("inf")
    lo = 0
    for hi, ch in enumerate(s):
        if need[ch] > 0:
            missing -= 1
        need[ch] -= 1
        while missing == 0:
            if hi - lo + 1 < best_len:
                best_start, best_len = lo, hi - lo + 1
            need[s[lo]] += 1
            if need[s[lo]] > 0:
                missing += 1
            lo += 1
    return "" if best_len == float("inf") else s[best_start:best_start + best_len]
`,
  'max-consecutive-ones-iii': `
def longest_ones(nums, k):
    best = zeros = lo = 0
    for hi, x in enumerate(nums):
        if x == 0:
            zeros += 1
        while zeros > k:
            if nums[lo] == 0:
                zeros -= 1
            lo += 1
        best = max(best, hi - lo + 1)
    return best
`,
  'fruit-into-baskets': `
from collections import Counter

def total_fruit(fruits):
    count = Counter()
    best = lo = 0
    for hi, fruit in enumerate(fruits):
        count[fruit] += 1
        while len(count) > 2:
            left = fruits[lo]
            count[left] -= 1
            if not count[left]:
                del count[left]
            lo += 1
        best = max(best, hi - lo + 1)
    return best
`,
  'min-operations-reduce-x': `
def min_operations(nums, x):
    keep = sum(nums) - x
    if keep < 0:
        return -1
    longest = -1
    total = lo = 0
    for hi in range(len(nums) + 1):
        while total > keep:
            total -= nums[lo]
            lo += 1
        if total == keep:
            longest = max(longest, hi - lo)
        if hi < len(nums):
            total += nums[hi]
    return -1 if longest < 0 else len(nums) - longest
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
  'search-rotated-array': `
def search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[lo] <= nums[mid]:
            if nums[lo] <= target < nums[mid]:
                hi = mid - 1
            else:
                lo = mid + 1
        elif nums[mid] < target <= nums[hi]:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
`,
  'find-min-rotated': `
def find_min(nums):
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] > nums[hi]:
            lo = mid + 1
        else:
            hi = mid
    return nums[lo]
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
  'product-of-array-except-self': `
def product_except_self(nums):
    out = [1] * len(nums)
    prefix = 1
    for i, x in enumerate(nums):
        out[i] = prefix
        prefix *= x
    suffix = 1
    for i in range(len(nums) - 1, -1, -1):
        out[i] *= suffix
        suffix *= nums[i]
    return out
`,
  'contiguous-array': `
def find_max_length(nums):
    first = {0: -1}
    balance = best = 0
    for i, x in enumerate(nums):
        balance += 1 if x == 1 else -1
        if balance in first:
            best = max(best, i - first[balance])
        else:
            first[balance] = i
    return best
`,
  'largest-rectangle-in-histogram': `
def largest_rectangle_area(heights):
    stack = []
    best = 0
    for i in range(len(heights) + 1):
        height = heights[i] if i < len(heights) else 0
        while stack and heights[stack[-1]] > height:
            h = heights[stack.pop()]
            left = stack[-1] if stack else -1
            best = max(best, h * (i - left - 1))
        stack.append(i)
    return best
`,
  'sum-subarray-minimums': `
def sum_subarray_mins(arr):
    mod = 10**9 + 7
    stack = []
    total = 0
    for i in range(len(arr) + 1):
        current = arr[i] if i < len(arr) else 0
        while stack and arr[stack[-1]] >= current:
            j = stack.pop()
            left = stack[-1] if stack else -1
            total += arr[j] * (j - left) * (i - j)
        stack.append(i)
    return total % mod
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
  'shortest-path-binary-matrix': `
from collections import deque

def shortest_path_binary_matrix(grid):
    n = len(grid)
    if grid[0][0] or grid[n - 1][n - 1]:
        return -1
    grid[0][0] = 1
    queue = deque([(0, 0, 1)])
    while queue:
        r, c, length = queue.popleft()
        if r == n - 1 and c == n - 1:
            return length
        for y in range(max(0, r - 1), min(n, r + 2)):
            for x in range(max(0, c - 1), min(n, c + 2)):
                if grid[y][x] == 0:
                    grid[y][x] = 1
                    queue.append((y, x, length + 1))
    return -1
`,
  'word-ladder': `
from collections import deque
from string import ascii_lowercase

def ladder_length(begin_word, end_word, word_list):
    unseen = set(word_list)
    if end_word not in unseen:
        return 0
    unseen.discard(begin_word)
    queue = deque([(begin_word, 1)])
    while queue:
        word, length = queue.popleft()
        for i in range(len(word)):
            for letter in ascii_lowercase:
                nxt = word[:i] + letter + word[i + 1:]
                if nxt in unseen:
                    if nxt == end_word:
                        return length + 1
                    unseen.remove(nxt)
                    queue.append((nxt, length + 1))
    return 0
`,
  'zero-one-matrix': `
from collections import deque

def update_matrix(mat):
    rows, cols = len(mat), len(mat[0])
    dist = [[0 if cell == 0 else -1 for cell in row] for row in mat]
    queue = deque((r, c) for r in range(rows) for c in range(cols) if mat[r][c] == 0)
    while queue:
        r, c = queue.popleft()
        for y, x in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)):
            if 0 <= y < rows and 0 <= x < cols and dist[y][x] < 0:
                dist[y][x] = dist[r][c] + 1
                queue.append((y, x))
    return dist
`,
  'open-the-lock': `
from collections import deque

def open_lock(deadends, target):
    dead = set(deadends)
    if '0000' in dead:
        return -1
    seen = {'0000'}
    queue = deque([('0000', 0)])
    while queue:
        code, turns = queue.popleft()
        if code == target:
            return turns
        for i in range(4):
            digit = int(code[i])
            for step in (1, 9):
                nxt = code[:i] + str((digit + step) % 10) + code[i + 1:]
                if nxt not in dead and nxt not in seen:
                    seen.add(nxt)
                    queue.append((nxt, turns + 1))
    return -1
`,
  'minimum-knight-moves': `
from collections import deque

def min_knight_moves(x, y):
    x, y = abs(x), abs(y)
    steps = ((1, 2), (2, 1), (-1, 2), (-2, 1), (1, -2), (2, -1), (-1, -2), (-2, -1))
    seen = {(0, 0)}
    queue = deque([(0, 0, 0)])
    while queue:
        a, b, moves = queue.popleft()
        if (a, b) == (x, y):
            return moves
        for da, db in steps:
            square = (a + da, b + db)
            if -2 <= square[0] <= x + 2 and -2 <= square[1] <= y + 2 and square not in seen:
                seen.add(square)
                queue.append((*square, moves + 1))
`,
  'far-from-land': `
from collections import deque

def max_distance(grid):
    n = len(grid)
    queue = deque((r, c) for r in range(n) for c in range(n) if grid[r][c] == 1)
    if len(queue) in (0, n * n):
        return -1
    distance = [[-1] * n for _ in range(n)]
    for r, c in queue:
        distance[r][c] = 0
    farthest = 0
    while queue:
        r, c = queue.popleft()
        for y, x in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= y < n and 0 <= x < n and distance[y][x] < 0:
                distance[y][x] = farthest = distance[r][c] + 1
                queue.append((y, x))
    return farthest
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
  'combination-sum': `
def combination_sum(candidates, target):
    candidates = sorted(candidates)
    out, path = [], []

    def go(start, rest):
        if rest == 0:
            out.append(path[:])
            return
        for i in range(start, len(candidates)):
            if candidates[i] > rest:
                break
            path.append(candidates[i])
            go(i, rest - candidates[i])
            path.pop()

    go(0, target)
    return out
`,
  'word-search': `
def exist(board, word):
    rows, cols = len(board), len(board[0])

    def spells(r, c, i):
        if not (0 <= r < rows and 0 <= c < cols) or board[r][c] != word[i]:
            return False
        if i == len(word) - 1:
            return True
        board[r][c] = '#'
        found = spells(r + 1, c, i + 1) or spells(r - 1, c, i + 1) or spells(r, c + 1, i + 1) or spells(r, c - 1, i + 1)
        board[r][c] = word[i]
        return found

    return any(spells(r, c, 0) for r in range(rows) for c in range(cols))
`,
  permutations: `
def permute(nums):
    out = []

    def go(i):
        if i == len(nums):
            out.append(nums[:])
            return
        for j in range(i, len(nums)):
            nums[i], nums[j] = nums[j], nums[i]
            go(i + 1)
            nums[i], nums[j] = nums[j], nums[i]

    go(0)
    return out
`,
  'n-queens-count': `
def total_n_queens(n):
    columns, down, up = set(), set(), set()

    def place(r):
        if r == n:
            return 1
        count = 0
        for c in range(n):
            if c in columns or r - c in down or r + c in up:
                continue
            columns.add(c)
            down.add(r - c)
            up.add(r + c)
            count += place(r + 1)
            columns.remove(c)
            down.remove(r - c)
            up.remove(r + c)
        return count

    return place(0)
`,
  'generate-parentheses': `
def generate_parenthesis(n):
    out, path = [], []

    def go(opened, closed):
        if closed == n:
            out.append(''.join(path))
            return
        if opened < n:
            path.append('(')
            go(opened + 1, closed)
            path.pop()
        if closed < opened:
            path.append(')')
            go(opened, closed + 1)
            path.pop()

    go(0, 0)
    return out
`,
  'letter-combinations': `
from itertools import product

KEYPAD = {'2': 'abc', '3': 'def', '4': 'ghi', '5': 'jkl', '6': 'mno', '7': 'pqrs', '8': 'tuv', '9': 'wxyz'}

def letter_combinations(digits):
    if not digits:
        return []
    return [''.join(letters) for letters in product(*(KEYPAD[d] for d in digits))]
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
  'non-overlapping-intervals': `
def erase_overlap_intervals(intervals):
    removed = 0
    end = float('-inf')
    for start, finish in sorted(intervals, key=lambda interval: interval[1]):
        if start < end:
            removed += 1
        else:
            end = finish
    return removed
`,
  'insert-interval': `
def insert(intervals, new_interval):
    start, end = new_interval
    out = []
    i, n = 0, len(intervals)
    while i < n and intervals[i][1] < start:
        out.append(intervals[i])
        i += 1
    while i < n and intervals[i][0] <= end:
        start = min(start, intervals[i][0])
        end = max(end, intervals[i][1])
        i += 1
    out.append([start, end])
    out.extend(intervals[i:])
    return out
`,
  'min-arrows-balloons': `
def find_min_arrow_shots(points):
    arrows, at = 0, None
    for start, end in sorted(points, key=lambda p: p[1]):
        if at is None or start > at:
            arrows += 1
            at = end
    return arrows
`,
  'interval-list-intersections': `
def interval_intersection(first_list, second_list):
    out = []
    i = j = 0
    while i < len(first_list) and j < len(second_list):
        start = max(first_list[i][0], second_list[j][0])
        end = min(first_list[i][1], second_list[j][1])
        if start <= end:
            out.append([start, end])
        if first_list[i][1] < second_list[j][1]:
            i += 1
        else:
            j += 1
    return out
`,
  'remove-covered-intervals': `
def remove_covered_intervals(intervals):
    kept, reach = 0, -1
    for _, end in sorted(intervals, key=lambda iv: (iv[0], -iv[1])):
        if end > reach:
            kept += 1
            reach = end
    return kept
`,
  'car-pooling': `
def car_pooling(trips, capacity):
    events = sorted([(start, n) for n, start, _ in trips] + [(end, -n) for n, _, end in trips])
    load = 0
    for _, change in events:
        load += change
        if load > capacity:
            return False
    return True
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
  'word-break': `
def word_break(s, word_dict):
    words = set(word_dict)
    longest = max(map(len, word_dict))
    ok = [True] + [False] * len(s)
    for end in range(1, len(s) + 1):
        for start in range(max(0, end - longest), end):
            if ok[start] and s[start:end] in words:
                ok[end] = True
                break
    return ok[-1]
`,
  'decode-ways': `
def num_decodings(s):
    mod = 10**9 + 7
    before, last = 0, 1
    for i, digit in enumerate(s):
        ways = 0 if digit == '0' else last
        if i and (s[i - 1] == '1' or (s[i - 1] == '2' and digit <= '6')):
            ways += before
        before, last = last, ways % mod
    return last
`,
  'maximum-product-subarray': `
def max_product(nums):
    best = high = low = nums[0]
    for x in nums[1:]:
        if x < 0:
            high, low = low, high
        high = max(x, high * x)
        low = min(x, low * x)
        best = max(best, high)
    return best
`,
  'combination-sum-iv': `
def combination_sum4(nums, target):
    ways = [1] + [0] * target
    for total in range(1, target + 1):
        ways[total] = sum(ways[total - x] for x in nums if x <= total)
    return ways[target]
`,
  'longest-string-chain': `
def longest_str_chain(words):
    best = {}
    for word in sorted(words, key=len):
        best[word] = 1 + max(best.get(word[:i] + word[i + 1:], 0) for i in range(len(word)))
    return max(best.values())
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
  'k-closest-points': `
import heapq

def k_closest(points, k):
    heap = []
    for x, y in points:
        entry = (-(x * x + y * y), x, y)
        if len(heap) < k:
            heapq.heappush(heap, entry)
        elif entry > heap[0]:
            heapq.heapreplace(heap, entry)
    return [[x, y] for _, x, y in heap]
`,
  'task-scheduler': `
from collections import Counter

def least_interval(tasks, n):
    counts = Counter(tasks).values()
    most = max(counts)
    tied = sum(1 for c in counts if c == most)
    return max(len(tasks), (most - 1) * (n + 1) + tied)
`,
  'kth-smallest-sorted-matrix': `
import heapq
from itertools import islice

def kth_smallest(matrix, k):
    return next(islice(heapq.merge(*matrix), k - 1, None))
`,
  'last-stone-weight': `
import heapq

def last_stone_weight(stones):
    heap = [-stone for stone in stones]
    heapq.heapify(heap)
    while len(heap) > 1:
        y = -heapq.heappop(heap)
        x = -heapq.heappop(heap)
        if x != y:
            heapq.heappush(heap, x - y)
    return -heap[0] if heap else 0
`,
  'merge-k-sorted-arrays': `
import heapq

def merge_k_arrays(arrays):
    heap = [(array[0], i, 0) for i, array in enumerate(arrays) if array]
    heapq.heapify(heap)
    out = []
    while heap:
        value, i, j = heap[0]
        out.append(value)
        if j + 1 < len(arrays[i]):
            heapq.heapreplace(heap, (arrays[i][j + 1], i, j + 1))
        else:
            heapq.heappop(heap)
    return out
`,
  ipo: `
import heapq

def find_maximized_capital(k, w, profits, capital):
    projects = sorted(zip(capital, profits))
    heap, i = [], 0
    for _ in range(k):
        while i < len(projects) and projects[i][0] <= w:
            heapq.heappush(heap, -projects[i][1])
            i += 1
        if not heap:
            break
        w -= heapq.heappop(heap)
    return w
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
  'edit-distance': `
def min_distance(word1, word2):
    prev = list(range(len(word2) + 1))
    for i, a in enumerate(word1, 1):
        row = [i]
        for j, b in enumerate(word2, 1):
            row.append(prev[j - 1] if a == b else 1 + min(prev[j], row[j - 1], prev[j - 1]))
        prev = row
    return prev[-1]
`,
  'longest-palindromic-subsequence': `
def longest_palindrome_subseq(s):
    n = len(s)
    below = [0] * n
    for i in range(n - 1, -1, -1):
        row = [0] * n
        row[i] = 1
        for j in range(i + 1, n):
            row[j] = below[j - 1] + 2 if s[i] == s[j] else max(below[j], row[j - 1])
        below = row
    return below[-1]
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
  'number-of-provinces': `
def find_circle_num(is_connected):
    n = len(is_connected)
    seen = [False] * n
    provinces = 0
    for start in range(n):
        if seen[start]:
            continue
        provinces += 1
        seen[start] = True
        stack = [start]
        while stack:
            city = stack.pop()
            for other, linked in enumerate(is_connected[city]):
                if linked and not seen[other]:
                    seen[other] = True
                    stack.append(other)
    return provinces
`,
  'equality-equations': `
def equations_possible(equations):
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, op, _, b in equations:
        if op == '=':
            parent[find(a)] = find(b)
    return all(find(a) != find(b) for a, op, _, b in equations if op == '!')
`,
  'smallest-string-with-swaps': `
def smallest_string_with_swaps(s, pairs):
    parent = list(range(len(s)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b in pairs:
        parent[find(a)] = find(b)
    groups = {}
    for i in range(len(s)):
        groups.setdefault(find(i), []).append(i)
    out = list(s)
    for positions in groups.values():
        for position, letter in zip(positions, sorted(s[i] for i in positions)):
            out[position] = letter
    return ''.join(out)
`,
  'most-stones-removed': `
def remove_stones(stones):
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for x, y in stones:
        parent[find(x)] = find(~y)
    return len(stones) - len({find(x) for x, _ in stones})
`,
  'make-network-connected': `
def make_connected(n, connections):
    if len(connections) < n - 1:
        return -1
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    groups = n
    for a, b in connections:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
            groups -= 1
    return groups - 1
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
  'parallel-courses': `
from collections import deque

def minimum_semesters(n, relations):
    adj = [[] for _ in range(n + 1)]
    indeg = [0] * (n + 1)
    for before, after in relations:
        adj[before].append(after)
        indeg[after] += 1
    queue = deque(course for course in range(1, n + 1) if indeg[course] == 0)
    taken = semesters = 0
    while queue:
        semesters += 1
        for _ in range(len(queue)):
            course = queue.popleft()
            taken += 1
            for nxt in adj[course]:
                indeg[nxt] -= 1
                if indeg[nxt] == 0:
                    queue.append(nxt)
    return semesters if taken == n else -1
`,
  'longest-increasing-path': `
from functools import cache

def longest_increasing_path(matrix):
    rows, cols = len(matrix), len(matrix[0])

    @cache
    def longest(r, c):
        best = 1
        for y, x in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= y < rows and 0 <= x < cols and matrix[y][x] > matrix[r][c]:
                best = max(best, 1 + longest(y, x))
        return best

    return max(longest(r, c) for r in range(rows) for c in range(cols))
`,
  'minimum-height-trees': `
def find_min_height_trees(n, edges):
    if n == 1:
        return [0]
    neighbors = [[] for _ in range(n)]
    for a, b in edges:
        neighbors[a].append(b)
        neighbors[b].append(a)
    degree = [len(nodes) for nodes in neighbors]
    leaves = [node for node in range(n) if degree[node] == 1]
    remaining = n
    while remaining > 2:
        remaining -= len(leaves)
        next_leaves = []
        for leaf in leaves:
            for node in neighbors[leaf]:
                degree[node] -= 1
                if degree[node] == 1:
                    next_leaves.append(node)
        leaves = next_leaves
    return leaves
`,
  'sequence-reconstruction': `
def sequence_reconstruction(nums, sequences):
    n = len(nums)
    following = [[] for _ in range(n + 1)]
    before = [0] * (n + 1)
    for seq in sequences:
        for a, b in zip(seq, seq[1:]):
            following[a].append(b)
            before[b] += 1
    ready = [v for v in range(1, n + 1) if before[v] == 0]
    for value in nums:
        if ready != [value]:
            return False
        ready = []
        for nxt in following[value]:
            before[nxt] -= 1
            if before[nxt] == 0:
                ready.append(nxt)
    return True
`,
  'parallel-courses-iii': `
from collections import deque

def minimum_time(n, relations, time):
    following = [[] for _ in range(n + 1)]
    waiting = [0] * (n + 1)
    for prev, nxt in relations:
        following[prev].append(nxt)
        waiting[nxt] += 1
    start = [0] * (n + 1)
    queue = deque(course for course in range(1, n + 1) if waiting[course] == 0)
    finish = 0
    while queue:
        course = queue.popleft()
        end = start[course] + time[course - 1]
        finish = max(finish, end)
        for nxt in following[course]:
            start[nxt] = max(start[nxt], end)
            waiting[nxt] -= 1
            if waiting[nxt] == 0:
                queue.append(nxt)
    return finish
`,
  'find-all-recipes': `
from collections import deque

def find_all_recipes(recipes, ingredients, supplies):
    stocked = set(supplies)
    index = {name: i for i, name in enumerate(recipes)}
    waiting = [0] * len(recipes)
    used_by = [[] for _ in recipes]
    for i, names in enumerate(ingredients):
        for name in names.split():
            if name in stocked:
                continue
            if name in index:
                used_by[index[name]].append(i)
                waiting[i] += 1
            else:
                waiting[i] = float('inf')
    queue = deque(i for i in range(len(recipes)) if waiting[i] == 0)
    cooked = []
    while queue:
        i = queue.popleft()
        cooked.append(recipes[i])
        for nxt in used_by[i]:
            waiting[nxt] -= 1
            if waiting[nxt] == 0:
                queue.append(nxt)
    return cooked
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
  'path-with-minimum-effort': `
import heapq

def minimum_effort_path(heights):
    rows, cols = len(heights), len(heights[0])
    effort = [[float('inf')] * cols for _ in range(rows)]
    effort[0][0] = 0
    heap = [(0, 0, 0)]
    while heap:
        cost, r, c = heapq.heappop(heap)
        if cost > effort[r][c]:
            continue
        if r == rows - 1 and c == cols - 1:
            return cost
        for y, x in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= y < rows and 0 <= x < cols:
                next_cost = max(cost, abs(heights[r][c] - heights[y][x]))
                if next_cost < effort[y][x]:
                    effort[y][x] = next_cost
                    heapq.heappush(heap, (next_cost, y, x))
    return 0
`,
  'cheapest-flights': `
def find_cheapest_price(n, flights, src, dst, k):
    cost = [float('inf')] * n
    cost[src] = 0
    for _ in range(k + 1):
        next_cost = cost[:]
        for a, b, price in flights:
            if cost[a] + price < next_cost[b]:
                next_cost[b] = cost[a] + price
        cost = next_cost
    return -1 if cost[dst] == float('inf') else cost[dst]
`,
  'swim-rising-water': `
import heapq

def swim_in_water(grid):
    n = len(grid)
    seen = {(0, 0)}
    heap = [(grid[0][0], 0, 0)]
    while True:
        time, r, c = heapq.heappop(heap)
        if r == c == n - 1:
            return time
        for y, x in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= y < n and 0 <= x < n and (y, x) not in seen:
                seen.add((y, x))
                heapq.heappush(heap, (max(time, grid[y][x]), y, x))
`,
  'minimum-obstacle-removal': `
from collections import deque

def minimum_obstacles(grid):
    rows, cols = len(grid), len(grid[0])
    best = [[rows * cols] * cols for _ in range(rows)]
    best[0][0] = 0
    queue = deque([(0, 0, 0)])
    while queue:
        cost, r, c = queue.popleft()
        if cost > best[r][c]:
            continue
        for y, x in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= y < rows and 0 <= x < cols and cost + grid[y][x] < best[y][x]:
                best[y][x] = cost + grid[y][x]
                if grid[y][x]:
                    queue.append((cost + 1, y, x))
                else:
                    queue.appendleft((cost, y, x))
    return best[-1][-1]
`,
  'path-max-probability': `
import heapq

def max_probability(n, edges, start, end):
    neighbors = [[] for _ in range(n)]
    for a, b, percent in edges:
        neighbors[a].append((b, percent / 100))
        neighbors[b].append((a, percent / 100))
    best = [0.0] * n
    best[start] = 1.0
    heap = [(-1.0, start)]
    while heap:
        negative, node = heapq.heappop(heap)
        chance = -negative
        if node == end:
            break
        if chance < best[node]:
            continue
        for nxt, edge in neighbors[node]:
            if chance * edge > best[nxt]:
                best[nxt] = chance * edge
                heapq.heappush(heap, (-best[nxt], nxt))
    return round(best[end] * 1_000_000)
`,
  'ways-to-arrive': `
import heapq

def count_paths(n, roads):
    mod = 1_000_000_007
    neighbors = [[] for _ in range(n)]
    for u, v, t in roads:
        neighbors[u].append((v, t))
        neighbors[v].append((u, t))
    time = [float('inf')] * n
    ways = [0] * n
    time[0], ways[0] = 0, 1
    heap = [(0, 0)]
    while heap:
        t, u = heapq.heappop(heap)
        if t > time[u]:
            continue
        for v, minutes in neighbors[u]:
            if t + minutes < time[v]:
                time[v] = t + minutes
                ways[v] = ways[u]
                heapq.heappush(heap, (time[v], v))
            elif t + minutes == time[v]:
                ways[v] = (ways[v] + ways[u]) % mod
    return ways[n - 1]
`,
  'min-cost-connect-points': `
def min_cost_connect_points(points):
    n = len(points)
    dist = [float('inf')] * n
    in_tree = [False] * n
    dist[0] = 0
    total = 0
    for _ in range(n):
        u = min((j for j in range(n) if not in_tree[j]), key=dist.__getitem__)
        in_tree[u] = True
        total += dist[u]
        x, y = points[u]
        for j in range(n):
            if not in_tree[j]:
                d = abs(x - points[j][0]) + abs(y - points[j][1])
                if d < dist[j]:
                    dist[j] = d
    return total
`,
  'connecting-cities': `
def minimum_cost(n, connections):
    parent = list(range(n + 1))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    total = used = 0
    for x, y, cost in sorted(connections, key=lambda road: road[2]):
        rx, ry = find(x), find(y)
        if rx != ry:
            parent[rx] = ry
            total += cost
            used += 1
            if used == n - 1:
                break
    return total if used == n - 1 else -1
`,
  'critical-mst-edges': `
def find_critical_and_pseudo_critical_edges(n, edges):
    order = sorted(range(len(edges)), key=lambda i: edges[i][2])

    def mst(skip, first):
        parent = list(range(n))

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        weight = used = 0
        for i in ([first] if first >= 0 else []) + order:
            if i == skip:
                continue
            a, b, w = edges[i]
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb
                weight += w
                used += 1
        return weight if used == n - 1 else float('inf')

    best = mst(-1, -1)
    critical, pseudo = [], []
    for i in range(len(edges)):
        if mst(i, -1) > best:
            critical.append(i)
        elif mst(-1, i) == best:
            pseudo.append(i)
    return [critical, pseudo]
`,
  'water-distribution': `
def min_cost_to_supply_water(n, wells, pipes):
    edges = [(cost, 0, house) for house, cost in enumerate(wells, 1)]
    edges += [(cost, a, b) for a, b, cost in pipes]
    edges.sort()
    parent = list(range(n + 1))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    total = used = 0
    for cost, a, b in edges:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
            total += cost
            used += 1
            if used == n:
                break
    return total
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
  'replace-words': `
def replace_words(dictionary, sentence):
    root = {}
    for word in dictionary:
        node = root
        for ch in word:
            node = node.setdefault(ch, {})
        node['#'] = True

    def replace(word):
        node = root
        for i, ch in enumerate(word):
            node = node.get(ch)
            if node is None:
                return word
            if '#' in node:
                return word[:i + 1]
        return word

    return ' '.join(replace(word) for word in sentence.split(' '))
`,
  'word-search-ii': `
def find_words(board, words):
    root = {}
    for word in words:
        node = root
        for letter in word:
            node = node.setdefault(letter, {})
        node['$'] = word
    rows, cols = len(board), len(board[0])
    found = []

    def visit(r, c, parent):
        letter = board[r][c]
        node = parent.get(letter)
        if node is None:
            return
        word = node.pop('$', None)
        if word is not None:
            found.append(word)
        board[r][c] = '#'
        if r > 0:
            visit(r - 1, c, node)
        if r + 1 < rows:
            visit(r + 1, c, node)
        if c > 0:
            visit(r, c - 1, node)
        if c + 1 < cols:
            visit(r, c + 1, node)
        board[r][c] = letter

    for r in range(rows):
        for c in range(cols):
            visit(r, c, root)
    return found
`,
  'longest-word-in-dictionary': `
def longest_word(words):
    built, best = {''}, ''
    for word in sorted(words):
        if word[:-1] in built:
            built.add(word)
            if len(word) > len(best):
                best = word
    return best
`,
  'search-suggestions-system': `
def suggested_products(products, search_word):
    root = {}
    for i in sorted(range(len(products)), key=products.__getitem__):
        node = root
        for letter in products[i]:
            node = node.setdefault(letter, {})
            top = node.setdefault('', [])
            if len(top) < 3:
                top.append(i)
    answer, node = [], root
    for letter in search_word:
        node = node.get(letter) if node is not None else None
        answer.append(node[''] if node is not None else [])
    return answer
`,
  'maximum-xor-with-element': `
def maximize_xor(nums, queries):
    nums = sorted(nums)
    child = [0, 0]
    answer = [-1] * len(queries)
    k = 0
    for j in sorted(range(len(queries)), key=lambda j: queries[j][1]):
        x, m = queries[j]
        while k < len(nums) and nums[k] <= m:
            node = 0
            for bit in range(29, -1, -1):
                slot = 2 * node + (nums[k] >> bit & 1)
                if not child[slot]:
                    child[slot] = len(child) // 2
                    child += (0, 0)
                node = child[slot]
            k += 1
        if k:
            node = best = 0
            for bit in range(29, -1, -1):
                slot = 2 * node + (x >> bit & 1 ^ 1)
                if child[slot]:
                    best |= 1 << bit
                else:
                    slot ^= 1
                node = child[slot]
            answer[j] = best
    return answer
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
  'circular-array-loop': `
def circular_array_loop(nums):
    n = len(nums)

    def next_index(i, positive):
        step = nums[i]
        if step == 0 or (step > 0) != positive:
            return -1
        j = (i + step) % n
        if j == i or nums[j] == 0 or (nums[j] > 0) != positive:
            return -1
        return j

    for start in range(n):
        if nums[start] == 0:
            continue
        positive = nums[start] > 0
        slow = fast = start
        while True:
            slow = next_index(slow, positive) if slow != -1 else -1
            fast = next_index(fast, positive) if fast != -1 else -1
            fast = next_index(fast, positive) if fast != -1 else -1
            if slow == -1 or fast == -1:
                break
            if slow == fast:
                return True
        i = start
        while nums[i] != 0 and (nums[i] > 0) == positive:
            nxt = (i + nums[i]) % n
            nums[i] = 0
            i = nxt
    return False
`,
  'happy-numbers': `
def happy_numbers(nums):
    def step(n):
        total = 0
        while n:
            n, digit = divmod(n, 10)
            total += digit * digit
        return total

    def is_happy(n):
        slow, fast = n, step(n)
        while fast != 1 and slow != fast:
            slow, fast = step(slow), step(step(fast))
        return fast == 1

    return [n for n in nums if is_happy(n)]
`,
  'move-zeroes': `
def move_zeroes(nums):
    slow = 0
    for fast, x in enumerate(nums):
        if x != 0:
            nums[slow], nums[fast] = x, nums[slow]
            slow += 1
    return nums
`,
  'remove-duplicates-sorted-ii': `
def remove_duplicates(nums):
    kept = 0
    for x in nums:
        if kept < 2 or nums[kept - 2] != x:
            nums[kept] = x
            kept += 1
    return nums[:kept]
`,
  'linked-list-cycle-ii': `
def detect_cycle(next):
    def step(node):
        return -1 if node == -1 else next[node]

    slow = fast = 0
    while True:
        slow, fast = step(slow), step(step(fast))
        if fast == -1:
            return -1
        if slow == fast:
            break
    slow = 0
    while slow != fast:
        slow, fast = next[slow], next[fast]
    return slow
`,
  'reverse-linked-list': `
def reverse_list(head):
    prev, curr = None, head
    while curr:
        nxt = curr.next
        curr.next = prev
        prev, curr = curr, nxt
    return prev
`,
  'reverse-linked-list-ii': `
def reverse_between(head, left, right):
    dummy = ListNode(0, head)
    before = dummy
    for _ in range(left - 1):
        before = before.next
    first = before.next
    prev, curr = None, first
    for _ in range(right - left + 1):
        nxt = curr.next
        curr.next = prev
        prev, curr = curr, nxt
    first.next = curr
    before.next = prev
    return dummy.next
`,
  'swap-nodes-in-pairs': `
def swap_pairs(head):
    dummy = ListNode(0, head)
    prev = dummy
    while prev.next and prev.next.next:
        first, second = prev.next, prev.next.next
        first.next = second.next
        second.next = first
        prev.next = second
        prev = first
    return dummy.next
`,
  'reverse-nodes-k-group': `
def reverse_k_group(head, k):
    dummy = ListNode(0, head)
    group_prev = dummy
    while True:
        last = group_prev
        for _ in range(k):
            last = last.next
            if last is None:
                return dummy.next
        first = group_prev.next
        prev, curr = last.next, first
        for _ in range(k):
            nxt = curr.next
            curr.next = prev
            prev, curr = curr, nxt
        group_prev.next = prev
        group_prev = first
`,
  'palindrome-linked-list': `
def is_palindrome(head):
    slow = fast = head
    while fast and fast.next:
        slow, fast = slow.next, fast.next.next
    prev = None
    while slow:
        nxt = slow.next
        slow.next = prev
        prev, slow = slow, nxt
    left, right = head, prev
    while right:
        if left.val != right.val:
            return False
        left, right = left.next, right.next
    return True
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
  'max-path-sum': `
def max_path_sum(root):
    best = root.val

    def gain(node):
        nonlocal best
        if not node:
            return 0
        left, right = max(gain(node.left), 0), max(gain(node.right), 0)
        best = max(best, node.val + left + right)
        return node.val + max(left, right)

    gain(root)
    return best
`,
  'validate-bst': `
def is_valid_bst(root):
    def valid(node, lo, hi):
        if not node:
            return True
        return lo < node.val < hi and valid(node.left, lo, node.val) and valid(node.right, node.val, hi)

    return valid(root, float('-inf'), float('inf'))
`,
  'lowest-common-ancestor': `
def lowest_common_ancestor(root, p, q):
    def find(node):
        if not node or node.val in (p, q):
            return node
        left, right = find(node.left), find(node.right)
        return node if left and right else left or right

    return find(root).val
`,
  'right-side-view': `
def right_side_view(root):
    view, level = [], [root] if root else []
    while level:
        view.append(level[-1].val)
        level = [child for node in level for child in (node.left, node.right) if child]
    return view
`,
  'path-sum-iii': `
from collections import defaultdict

def path_sum(root, target_sum):
    prefixes = defaultdict(int)
    prefixes[0] = 1

    def count(node, above):
        if not node:
            return 0
        total = above + node.val
        paths = prefixes[total - target_sum]
        prefixes[total] += 1
        paths += count(node.left, total) + count(node.right, total)
        prefixes[total] -= 1
        return paths

    return count(root, 0)
`,
  'kth-smallest-bst': `
def kth_smallest(root, k):
    stack, node = [], root
    while True:
        while node:
            stack.append(node)
            node = node.left
        node = stack.pop()
        k -= 1
        if k == 0:
            return node.val
        node = node.right
`,
  'count-good-nodes': `
def good_nodes(root):
    def count(node, highest):
        if not node:
            return 0
        highest = max(highest, node.val)
        return (node.val >= highest) + count(node.left, highest) + count(node.right, highest)

    return count(root, root.val)
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
  'counting-bits': `
def count_bits(n):
    ans = [0] * (n + 1)
    for i in range(1, n + 1):
        ans[i] = ans[i >> 1] + (i & 1)
    return ans
`,
  'split-array-largest-sum': `
def split_array(nums, k):
    def parts(limit):
        count, total = 1, 0
        for x in nums:
            if total + x > limit:
                count += 1
                total = x
            else:
                total += x
        return count

    lo, hi = max(nums), sum(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if parts(mid) <= k:
            hi = mid
        else:
            lo = mid + 1
    return lo
`,
  'ship-within-days': `
def ship_within_days(weights, days):
    def days_needed(capacity):
        count, load = 1, 0
        for w in weights:
            if load + w > capacity:
                count += 1
                load = w
            else:
                load += w
        return count

    lo, hi = max(weights), sum(weights)
    while lo < hi:
        mid = (lo + hi) // 2
        if days_needed(mid) <= days:
            hi = mid
        else:
            lo = mid + 1
    return lo
`,
  'search-2d-matrix': `
def search_matrix(matrix, target):
    cols = len(matrix[0])
    lo, hi = 0, len(matrix) * cols - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        value = matrix[mid // cols][mid % cols]
        if value == target:
            return True
        if value < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return False
`,
  'subarray-sums-divisible-k': `
def subarrays_div_by_k(nums, k):
    seen = [0] * k
    seen[0] = 1
    remainder = count = 0
    for x in nums:
        remainder = (remainder + x) % k
        count += seen[remainder]
        seen[remainder] += 1
    return count
`,
  'count-nice-subarrays': `
def number_of_subarrays(nums, k):
    seen = [0] * (len(nums) + 1)
    seen[0] = 1
    odd = count = 0
    for x in nums:
        odd += x & 1
        if odd >= k:
            count += seen[odd - k]
        seen[odd] += 1
    return count
`,
  'longest-well-performing-interval': `
def longest_wpi(hours):
    first = {}
    score = best = 0
    for i, h in enumerate(hours):
        score += 1 if h > 8 else -1
        if score > 0:
            best = i + 1
        elif score - 1 in first:
            best = max(best, i - first[score - 1])
        first.setdefault(score, i)
    return best
`,
  'find-pivot-index': `
def pivot_index(nums):
    right = sum(nums)
    left = 0
    for i, x in enumerate(nums):
        right -= x
        if left == right:
            return i
        left += x
    return -1
`,
  'max-size-subarray-sum-k': `
def max_sub_array_len(nums, k):
    first = {0: -1}
    total = best = 0
    for i, x in enumerate(nums):
        total += x
        if total - k in first:
            best = max(best, i - first[total - k])
        first.setdefault(total, i)
    return best
`,
  'sliding-window-maximum': `
from collections import deque


def max_sliding_window(nums, k):
    window = deque()
    out = []
    for i, x in enumerate(nums):
        while window and nums[window[-1]] <= x:
            window.pop()
        window.append(i)
        if window[0] <= i - k:
            window.popleft()
        if i >= k - 1:
            out.append(nums[window[0]])
    return out
`,
  'car-fleet': `
def car_fleet(target, position, speed):
    fleets = []
    for p, s in sorted(zip(position, speed), reverse=True):
        distance = target - p
        if not fleets or distance * fleets[-1][1] > fleets[-1][0] * s:
            fleets.append((distance, s))
    return len(fleets)
`,
  'remove-k-digits': `
def remove_kdigits(num, k):
    kept = []
    for digit in num:
        while k and kept and kept[-1] > digit:
            kept.pop()
            k -= 1
        kept.append(digit)
    if k:
        del kept[-k:]
    return ''.join(kept).lstrip('0') or '0'
`,
  'next-greater-element-ii': `
def next_greater_elements(nums):
    n = len(nums)
    out = [-1] * n
    stack = []
    for i in range(2 * n):
        x = nums[i % n]
        while stack and nums[stack[-1]] < x:
            out[stack.pop()] = x
        if i < n:
            stack.append(i)
    return out
`,
  '132-pattern': `
def find132pattern(nums):
    stack, third = [], float('-inf')
    for x in reversed(nums):
        if x < third:
            return True
        while stack and stack[-1] < x:
            third = stack.pop()
        stack.append(x)
    return False
`,
  'maximal-rectangle': `
def maximal_rectangle(matrix):
    heights = [0] * (len(matrix[0]) + 1)
    best = 0
    for row in matrix:
        for c, cell in enumerate(row):
            heights[c] = heights[c] + 1 if cell == '1' else 0
        stack = [-1]
        for c, h in enumerate(heights):
            while h < heights[stack[-1]]:
                height = heights[stack.pop()]
                best = max(best, height * (c - stack[-1] - 1))
            stack.append(c)
    return best
`,
  'meeting-rooms-ii': `
import heapq


def min_meeting_rooms(intervals):
    ends = []
    for start, end in sorted(intervals):
        if ends and ends[0] <= start:
            heapq.heapreplace(ends, end)
        else:
            heapq.heappush(ends, end)
    return len(ends)
`,
  'partition-labels': `
def partition_labels(s):
    last = {letter: i for i, letter in enumerate(s)}
    sizes, start, end = [], 0, 0
    for i, letter in enumerate(s):
        end = max(end, last[letter])
        if i == end:
            sizes.append(end - start + 1)
            start = i + 1
    return sizes
`,
  candy: `
def candy(ratings):
    n = len(ratings)
    candies = [1] * n
    for i in range(1, n):
        if ratings[i] > ratings[i - 1]:
            candies[i] = candies[i - 1] + 1
    for i in range(n - 2, -1, -1):
        if ratings[i] > ratings[i + 1]:
            candies[i] = max(candies[i], candies[i + 1] + 1)
    return sum(candies)
`,
  'jump-game-ii': `
def jump(nums):
    jumps = end = far = 0
    for i in range(len(nums) - 1):
        far = max(far, i + nums[i])
        if i == end:
            jumps += 1
            end = far
    return jumps
`,
  'min-refueling-stops': `
import heapq

def min_refuel_stops(target, start_fuel, stations):
    passed = []
    reach, stops, i = start_fuel, 0, 0
    while reach < target:
        while i < len(stations) and stations[i][0] <= reach:
            heapq.heappush(passed, -stations[i][1])
            i += 1
        if not passed:
            return -1
        reach -= heapq.heappop(passed)
        stops += 1
    return stops
`,
  'partition-equal-subset': `
def can_partition(nums):
    total = sum(nums)
    if total % 2:
        return False
    reachable = 1
    for x in nums:
        reachable |= reachable << x
    return bool(reachable >> (total // 2) & 1)
`,
  'longest-increasing-subsequence': `
from bisect import bisect_left


def length_of_lis(nums):
    tails = []
    for x in nums:
        k = bisect_left(tails, x)
        if k == len(tails):
            tails.append(x)
        else:
            tails[k] = x
    return len(tails)
`,
  'interleaving-string': `
def is_interleave(s1, s2, s3):
    m, n = len(s1), len(s2)
    if len(s3) != m + n:
        return False
    dp = [True] + [False] * n
    for j in range(1, n + 1):
        dp[j] = dp[j - 1] and s2[j - 1] == s3[j - 1]
    for i in range(1, m + 1):
        dp[0] = dp[0] and s1[i - 1] == s3[i - 1]
        for j in range(1, n + 1):
            letter = s3[i + j - 1]
            dp[j] = (dp[j] and s1[i - 1] == letter) or (dp[j - 1] and s2[j - 1] == letter)
    return dp[n]
`,
  'unique-paths-ii': `
def unique_paths_with_obstacles(grid):
    mod = 10**9 + 7
    ways = [1] + [0] * (len(grid[0]) - 1)
    for row in grid:
        for c, cell in enumerate(row):
            if cell:
                ways[c] = 0
            elif c:
                ways[c] = (ways[c] + ways[c - 1]) % mod
    return ways[-1]
`,
  'distinct-subsequences': `
def num_distinct(s, t):
    ways = [1] + [0] * len(t)
    for letter in s:
        for j in range(len(t), 0, -1):
            if t[j - 1] == letter:
                ways[j] += ways[j - 1]
    return ways[-1]
`,
  'count-palindromic-substrings': `
def count_substrings(s):
    n = len(s)
    count = 0
    for center in range(2 * n - 1):
        left, right = center // 2, (center + 1) // 2
        while left >= 0 and right < n and s[left] == s[right]:
            count += 1
            left -= 1
            right += 1
    return count
`,
  'minimum-path-sum': `
def min_path_sum(grid):
    best = [float('inf')] * len(grid[0])
    best[0] = 0
    for row in grid:
        for c, cost in enumerate(row):
            best[c] = cost + (min(best[c], best[c - 1]) if c else best[c])
    return best[-1]
`,
  'maximal-square': `
def maximal_square(matrix):
    cols = len(matrix[0])
    above = [0] * (cols + 1)
    side = 0
    for row in matrix:
        here = [0] * (cols + 1)
        for c in range(1, cols + 1):
            if row[c - 1] == '1':
                here[c] = 1 + min(above[c], above[c - 1], here[c - 1])
                side = max(side, here[c])
        above = here
    return side * side
`,
  'burst-balloons': `
def max_coins(nums):
    vals = [1] + nums + [1]
    n = len(vals)
    best = [[0] * n for _ in range(n)]
    for left in range(n - 3, -1, -1):
        for right in range(left + 2, n):
            edge = vals[left] * vals[right]
            best[left][right] = max(best[left][k] + best[k][right] + edge * vals[k] for k in range(left + 1, right))
    return best[0][n - 1]
`,
  'maximum-xor-pair': `
def find_maximum_xor(nums):
    best = 0
    for bit in range(30, -1, -1):
        best <<= 1
        prefixes = {x >> bit for x in nums}
        if any((best | 1) ^ p in prefixes for p in prefixes):
            best |= 1
    return best
`,
  'missing-number': `
def missing_number(nums):
    missing = len(nums)
    for i, x in enumerate(nums):
        missing ^= i ^ x
    return missing
`,
  'single-number-ii': `
def single_number(nums):
    ones = twos = 0
    for x in nums:
        ones = (ones ^ x) & ~twos
        twos = (twos ^ x) & ~ones
    return ones
`,
  'minimum-flips-or': `
def min_flips(a, b, c):
    flips = 0
    for bit in range(31):
        x, y, z = a >> bit & 1, b >> bit & 1, c >> bit & 1
        flips += 1 - (x | y) if z else x + y
    return flips
`,
  'minimum-xor-sum': `
def minimum_xor_sum(nums1, nums2):
    n = len(nums1)
    dp = [float('inf')] * (1 << n)
    dp[0] = 0
    for mask in range((1 << n) - 1):
        i = bin(mask).count('1')
        for j in range(n):
            if not mask & (1 << j):
                to = mask | (1 << j)
                dp[to] = min(dp[to], dp[mask] + (nums1[i] ^ nums2[j]))
    return dp[-1]
`,
  'partition-k-subsets': `
def can_partition_k_subsets(nums, k):
    total = sum(nums)
    if total % k:
        return False
    target = total // k
    n = len(nums)
    fill = [-1] * (1 << n)
    fill[0] = 0
    for mask in range(1 << n):
        if fill[mask] < 0:
            continue
        for j in range(n):
            if not mask & (1 << j) and fill[mask] + nums[j] <= target:
                fill[mask | (1 << j)] = (fill[mask] + nums[j]) % target
    return fill[-1] == 0
`,
  'shortest-path-all-nodes': `
from collections import deque

def shortest_path_length(graph):
    n = len(graph)
    full = (1 << n) - 1
    seen = {(i, 1 << i) for i in range(n)}
    queue = deque((i, 1 << i, 0) for i in range(n))
    while queue:
        node, mask, steps = queue.popleft()
        if mask == full:
            return steps
        for nxt in graph[node]:
            state = (nxt, mask | (1 << nxt))
            if state not in seen:
                seen.add(state)
                queue.append((*state, steps + 1))
`,
  'maximum-students': `
def max_students(seats):
    n = len(seats[0])
    best = {0: 0}
    for row in seats:
        good = sum(1 << c for c, seat in enumerate(row) if seat == '.')
        nxt = {}
        for mask in range(1 << n):
            if mask & ~good or mask & (mask >> 1):
                continue
            fits = [v for prev, v in best.items() if not mask & (prev << 1) and not mask & (prev >> 1)]
            if fits:
                nxt[mask] = max(fits) + bin(mask).count('1')
        best = nxt
    return max(best.values())
`,
  'hats-to-people': `
def number_ways(hats):
    mod = 10**9 + 7
    n = len(hats)
    liked_by = [[] for _ in range(41)]
    for person, liked in enumerate(hats):
        for hat in liked:
            liked_by[hat].append(person)
    ways = [0] * (1 << n)
    ways[0] = 1
    for hat in range(1, 41):
        before = ways[:]
        for mask in range(1 << n):
            if before[mask]:
                for person in liked_by[hat]:
                    if not mask & (1 << person):
                        ways[mask | (1 << person)] = (ways[mask | (1 << person)] + before[mask]) % mod
    return ways[-1]
`,
};
