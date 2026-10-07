import { MOCK_PROBLEMS } from '@grasp/engine';
import { pickBehavioralProblem } from './behavioral-problems.js';
import type { InterviewProblem, InterviewTrack } from './interview.types.js';

type Prompts = Pick<InterviewProblem, 'opening' | 'referenceNotes' | 'hints'>;

/** What the interviewer says and checks for each problem in the engine's mock index. */
export const PROMPTS: Record<string, Prompts> = {
  'warmer-days': {
    opening:
      "Let's start. You get an array of daily temperatures. For each day, return how many days you would have to wait for a strictly warmer temperature, or 0 if it never comes. For example [73, 74, 75, 71, 69, 72, 76, 73] → [1, 1, 4, 2, 1, 1, 0, 0]. Take a minute, ask me anything you need, and talk me through how you would approach it.",
    referenceNotes:
      'Brute force O(n²) scanning right from each index. Optimal: monotonic decreasing stack of indices; when a warmer temp arrives, pop and set answer[idx] = i - idx. O(n) time, O(n) space. Edge cases: equal temperatures (strictly warmer → do not pop on equal), all decreasing, single element. Follow-ups: iterate right-to-left variant; streaming input; what if we need next warmer by at least k degrees.',
    hints: [
      'What makes the brute force slow? Which work is being repeated?',
      'Think about the days that are still "waiting" for an answer. What order are their temperatures in?',
      'If you keep the waiting days on a stack, what happens to the stack when a warmer day arrives?',
    ],
  },
  'shipping-capacity': {
    opening:
      "A conveyor has packages with given weights that must be shipped in order. Each day you load packages onto a truck until adding the next would exceed the truck's capacity. Find the smallest capacity that ships everything within D days. For weights [1..10] and D = 5 the answer is 15. How would you tackle it?",
    referenceNotes:
      'Capacity range [max(weights), sum(weights)]. Feasibility check is greedy O(n) and monotonic in capacity → binary search on the answer: O(n log(sum)). Edge cases: D ≥ n (answer is max weight), D = 1 (sum), single heavy package. Follow-ups: why is feasibility monotonic; what if packages could be reordered (becomes bin packing, NP-hard); overflow in other languages.',
    hints: [
      'If I hand you a capacity, can you quickly tell me whether it works?',
      'What are the smallest and largest capacities that could possibly be the answer?',
      'If capacity c works, does c + 1 also work? What does that property let you do?',
    ],
  },
  'course-order': {
    opening:
      'There are n courses labeled 0 to n − 1 and a list of prerequisite pairs [a, b] meaning you must take b before a. Return any valid order to take all courses, or an empty list if it is impossible. Walk me through your thinking.',
    referenceNotes:
      "Model as a directed graph b → a. Kahn's algorithm with in-degrees and a queue, or DFS with three colors for cycle detection. O(V + E). Impossible iff a cycle exists (order length < n). Edge cases: no prerequisites, self-dependency, disconnected components, duplicate edges. Follow-ups: return all courses takeable per semester (BFS levels); lexicographically smallest order (min-heap).",
    hints: [
      'How would you represent this as a graph? Which way do the edges point?',
      'Which courses can you take right now, on day one?',
      'After taking a course, how do you know which new courses have become available?',
    ],
  },
  'longest-k-replace': {
    opening:
      'Given an uppercase string s and an integer k, you can change at most k characters to any other uppercase letter. Return the length of the longest substring containing a single repeated letter you can get. For "AABABBA" with k = 1 the answer is 4. How would you approach this?',
    referenceNotes:
      'Sliding window with counts; window valid if (length − maxCount) ≤ k. Expand right, shrink left when invalid. O(n) time, O(26) space. Subtlety: maxCount need not be decreased when shrinking (answer only grows when maxCount grows). Edge cases: k ≥ n, all same letter, k = 0.',
    hints: [
      'For a fixed window, how many changes would you need to make it all one letter?',
      'Could you grow a window on the right and shrink it on the left only when it becomes invalid?',
      'What do you need to track inside the window to answer the validity question in O(1)?',
    ],
  },
  'url-shortener': {
    opening:
      "Let's design a URL shortening service like the ones used in social media links: users submit a long URL and get a short one, and visiting the short link redirects. Where would you like to start?",
    referenceNotes:
      'Requirements: create, redirect, optional custom alias/expiry/analytics. Scale: e.g. 100M new URLs/month (~40 writes/s), 100:1 read:write (~4k reads/s, peaks 10×). Storage: 500 bytes × 100M × 12 × 5 years ≈ 3 TB. Key generation: base62 of a counter (range allocation per node) vs hash + collision check vs pre-generated key service. Read path: CDN/edge + cache (hot links), 301 vs 302 trade-off (caching vs analytics). DB: key-value store partitioned by short key. Analytics via async queue. Deep dives: collision handling, abuse/spam, hot keys, custom aliases uniqueness.',
    hints: [
      'Before architecture: what are the functional requirements, and roughly how much traffic are we talking about?',
      'How will you generate short keys so that two servers never hand out the same one?',
      'The read path dominates. What sits in front of the database so most redirects never touch it?',
    ],
  },
  'news-feed': {
    opening:
      'Design the home feed for a social network: users follow others and see a ranked feed of recent posts from people they follow. Tell me how you would approach it.',
    referenceNotes:
      'Requirements: post, follow, fetch feed (paginated), ranking. Scale: 300M DAU, feed reads ≫ posts. Fan-out on write (precompute feed caches per user, fast reads, expensive for celebrities) vs fan-out on read (merge at read time) → hybrid: push for normal users, pull for celebrities. Storage: posts table, social graph store, feed cache (Redis lists of post ids). Media via object storage + CDN. Ranking service async. Pagination with cursors. Deep dives: celebrity problem, cache invalidation on delete, consistency expectations.',
    hints: [
      "What are the two fundamental ways to assemble a user's feed, and when is each expensive?",
      'What happens when someone with 50 million followers posts?',
      'Where does the precomputed feed live, and what exactly do you store in it?',
    ],
  },
  'rate-limiter': {
    opening:
      'We need a rate limiter for our public API: limit each API key to N requests per time window across a fleet of stateless API servers. How would you design it?',
    referenceNotes:
      'Algorithms: fixed window (burst at edges), sliding log (exact, memory heavy), sliding window counter (approximation), token bucket (bursts + steady rate), leaky bucket. Placement: API gateway/middleware. Shared state in Redis with atomic INCR+EXPIRE or Lua script; per-node local buckets with periodic sync for lower latency. Failure mode: fail-open vs fail-closed. Response: 429 with Retry-After and rate-limit headers. Multi-region: local limits with global reconciliation. Hot keys sharded by key.',
    hints: [
      'Which rate-limiting algorithms do you know, and how do they handle bursts?',
      'The API servers are stateless. Where does the counter live, and how do you update it atomically?',
      'What should happen if the rate-limiter store becomes unavailable?',
    ],
  },
  'chat-service': {
    opening:
      'Design a one-to-one and small-group chat service with online presence and message history, used on mobile and web. Where do you want to begin?',
    referenceNotes:
      'Requirements: send/receive in real time, history, delivery/read receipts, presence, offline push. Connections: WebSockets to stateless gateway servers; session registry (user → gateway) in Redis. Message flow: gateway → chat service → persist (wide-column store keyed by conversation, time-ordered ids e.g. Snowflake) → route to recipient gateways or push notification if offline. Ordering per conversation, idempotency keys for retries. Presence via heartbeats with TTL. Group fan-out. Deep dives: exactly-once illusion, multi-device sync, message ids, storage growth, end-to-end encryption trade-offs.',
    hints: [
      "How does a message physically get from the sender's phone to the recipient's phone in real time?",
      'Many gateway servers hold connections. How do you know which one the recipient is connected to?',
      'How do you order messages in a conversation and avoid duplicates when clients retry?',
    ],
  },
};

export const PROBLEMS: InterviewProblem[] = MOCK_PROBLEMS.map(({ id, track, title, patternIds }) => ({
  id,
  track,
  title,
  patternIds: [...patternIds],
  ...PROMPTS[id],
}));

export function pickProblem(track: InterviewTrack, problemId?: string): InterviewProblem | undefined {
  if (track === 'behavioral') return pickBehavioralProblem(problemId);
  if (problemId) return PROBLEMS.find((p) => p.id === problemId && p.track === track);
  const pool = PROBLEMS.filter((p) => p.track === track);
  return pool[Math.floor(Math.random() * pool.length)];
}
