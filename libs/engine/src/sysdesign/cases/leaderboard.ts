import type { CaseStudy } from './types.js';

export const LEADERBOARD: CaseStudy = {
  id: 'leaderboard',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt:
        'A mobile game shows every player the top of the global board, their own rank and the players just above and below them, all time, today and this week. Which requirements shape the design, and how fresh must a rank be?',
      decision: {
        question: 'What do you promise about scores and ranks?',
        options: [
          {
            label: 'No accepted result is ever lost, a player sees their own new score at once, and ranks may lag by a second or two',
            best: true,
            why: 'The durable record of results is the truth, and the ranking is a view derived from it that can be rebuilt. Nobody can tell whether rank 1,204,311 is a second old, but everyone notices a lost high score.',
          },
          {
            label: 'Every rank is exact and consistent for every reader at every instant',
            why: 'With thousands of scores changing each second, one ordering agreed by every reader means serializing all updates and all reads through one place. It buys nothing a player can see and caps the whole system at one node.',
          },
          {
            label: 'Recompute the rankings in a batch job every hour',
            why: 'Cheap and simple, and fine for a board that only decides end of season rewards. A player who just beat their best and sees the old rank for an hour thinks the game is broken.',
          },
        ],
      },
      points: [
        'Functional: record match results, show the top 100 of a board, show a player their rank and score with the five players above and below, and keep all-time, daily and weekly boards. Friends boards are a likely follow-up.',
        'Scale (from the interviewer): 80 million players have a score, 30 million play on a given day, and each plays about 8 matches a day, with evenings at about three times the average rate.',
        'Non-functional: rank reads well under 100 ms, a new result visible within a second or two, results never lost or counted twice, and ties broken in a way players accept as fair.',
        'Cheating matters: a board whose top 10 is full of impossible scores is worse than no board, and rewards often depend on it.',
        'Out of scope unless asked: matchmaking, the game servers themselves, anti-cheat inside the client, and the rewards shop.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the load',
      prompt:
        '30 million daily players finish about 8 matches each, and evenings run at three times the average. How many results per second arrive at peak?',
      estimate: {
        question: 'Match results per second at the evening peak',
        answer: 8_333,
        unit: 'results/s',
        working: [
          '30 million players x 8 matches is 240 million results a day.',
          '240,000,000 / 86,400 seconds is about 2,778 results per second on average.',
          'At three times the average: 720,000,000 / 86,400 is about 8,333 results per second at peak.',
        ],
      },
      points: [
        'Each result updates three boards (all time, today and this week): about 25,000 sorted set writes a second at peak.',
        'Reads: the results screen and menus show about 5 leaderboard views per match, so 5 x 8,333 is about 42,000 reads a second. Together about 50,000 requests a second, 83% of them reads.',
        'Most reads are two kinds: the top of a board, which is the same for everyone and caches perfectly, and "me and my neighbours", which is different for every player and has to come from the ranking itself.',
        'None of this is large for a key-value store. The hard part is answering "what is my rank among 80 million?" in milliseconds while scores keep moving.',
      ],
    },
    {
      kind: 'api',
      title: 'Who reports a score',
      prompt:
        'A player finishes a match with 48,200 points. Where does that number come from, and how does it reach the leaderboard without letting anyone post whatever score they like?',
      decision: {
        question: 'How does a result reach the leaderboard service?',
        options: [
          {
            label: 'The game server that ran the match reports the result, signed and keyed by match ID; the client never posts a score',
            best: true,
            why: 'The server that simulated the match is the only party that knows the real score, so a modified client has nothing to forge. The match ID makes a retried report harmless.',
          },
          {
            label: 'The client posts its score, signed with a key built into the app',
            why: 'Any key shipped in an app can be pulled out of it, and then any score can be signed. It stops casual tampering and nothing more. For single-player games where the client must report, add plausibility checks and replay checks on top.',
          },
          {
            label: 'The client posts its score over HTTPS with the player login token',
            why: 'TLS protects the score from others on the network, not from the player who owns the device. A proxy on their own phone lets them send any number with a valid token.',
          },
        ],
      },
      points: [
        '`PUT /results/{match_id}` from the game server (service credentials, not a player token) with each player ID, score and match end time. The match ID is the idempotency key: a retried report changes nothing.',
        '`GET /boards/{id}/top` with a limit up to 100 returns rank, player, display name and score. Board IDs name the scope and window, such as all time, today or this week.',
        '`GET /boards/{id}/me` with `around=5` returns the rank and score of the caller, the neighbours on each side, plus an `as_of` time so the client can say how fresh it is.',
        'Ranks are 1-based on the wire, even though Redis counts from 0, and the response says how ties are ranked so the client can show "=12" if the product wants shared ranks.',
      ],
    },
    {
      kind: 'data',
      title: 'Store scores so ranks are cheap',
      prompt:
        'The board has 80 million entries. A player asks for their rank. What data structure answers in milliseconds, and how much memory does it take?',
      decision: {
        question: 'What answers "what is my rank?" for 80 million players?',
        options: [
          {
            label: 'A Redis sorted set per board: score by player, kept ordered in a skip list',
            best: true,
            why: 'Adding or changing a score and reading a rank are both O(log n), about 27 steps for 80 million, and a range of neighbours costs O(log n + m). That is exactly the set of queries a leaderboard asks.',
          },
          {
            label: 'A relational table with an index on score: rank is a count of the rows with a higher score',
            why: 'The top 100 is fast, but a B-tree does not know how many entries lie before a key, so counting the rows above a mid-table player scans millions of index entries for every request.',
          },
          {
            label: 'Store every rank in a column and update it when scores change',
            why: 'One player jumping from rank 5 million to rank 10 shifts 5 million other ranks by one. Every score change becomes a huge write.',
          },
          {
            label: 'Sort all scores in a batch job and publish the ranks',
            why: 'Right for end of season results and for boards nobody watches live. For a live board it is stale between runs, and sorting 80 million entries every minute is a lot of work for a few changes.',
          },
        ],
      },
      estimate: {
        question: 'Memory for the all-time board as one sorted set',
        answer: 8,
        unit: 'GB',
        working: [
          'Each entry holds the member (a short player ID), a hash table entry and a skip list node: about 100 bytes all told.',
          '80,000,000 players x 100 bytes is 8,000,000,000 bytes, about 8 GB.',
          'Today (30 million players) is about 3 GB more, and this week (say 50 million) about 5 GB: about 16 GB of boards, which fits in memory on one machine.',
        ],
      },
      points: [
        'Writes: `ZADD board GT s p` keeps the best score (the `GT` flag, Redis 6.2 and later, only raises it). For points that add up, keep the running total in the database and write the total with `ZADD`, never `ZINCRBY`, so a replayed update is harmless.',
        'Reads: `ZRANGE board 0 99 REV` is the top 100; `ZREVRANK board p` is the 0-based rank, and `ZRANGE board a b REV` with a = max(0, r - 5) and b = r + 5 gives the neighbours; an unclamped negative start would count from the bottom of the board.',
        'Ties: Redis orders equal scores by member bytes, and the reverse reads used here flip that, so the player whose ID sorts last as a string wins every tie. That looks arbitrary. Either pack a tie breaker into the score, or rank ties together as one plus the count of higher scores, `ZCOUNT board (s +inf`.',
        'Packing the tie breaker: scores are 64-bit doubles, exact for integers up to 2^53. A weekly board can use points x 2^20 plus (2^20 - 1 - seconds since the week began): a week is 604,800 seconds, under 2^20, so whoever reached the score first ranks higher, with points up to 2^33.',
        'The durable store holds every result row (unique match ID and player) and the per-player totals for each board. It is sharded by player ID, and it can rebuild any board from scratch.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt:
        'Trace a match result from the game server to a rank on a phone. Which parts see 42,000 reads a second, which see the writes, and what is the source of truth?',
      lab: true,
      points: [
        'Game servers post results to the score service, which checks the signature and plausibility, then appends the result to a stream partitioned by player ID and acknowledges. Partitioning by player keeps one player in order.',
        'Consumers insert the result row (a unique match ID makes duplicates no-ops), update the player totals in the durable store, then write the new totals to the all-time, daily and weekly sorted sets in one pipeline.',
        'Read servers answer "me and my neighbours" from the sorted sets, from replicas where a second of lag is fine, and serve the top 100 from a copy they refresh every second, so the busiest query costs Redis one call a second per server.',
        'The player who just finished a match sees their new score straight from the result, not from a replica, so their own rank never appears to go backwards.',
        'Open the build in the Lab: 50,000 requests a second, about 42,000 reads and 8,500 results. The cache stands for the Redis sorted sets, the queue and workers for the result stream and its consumers, and the database for the durable score store sharded by player. Lower the cache hit rate to see what ranking in the database would cost.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Shard a global ranking',
      prompt:
        'Today one sorted set per board fits one node. The game grows to 500 million players and a live event pushes 200,000 updates a second onto one board. How do you split a ranking that is global by definition?',
      decision: {
        question: 'How do you split one global board across nodes?',
        options: [
          {
            label:
              'Hash players across N sorted sets; merge the top of each for the top list, and sum the counts of higher scores for a rank',
            best: true,
            why: 'Writes spread evenly and each shard stays small. The top 100 is the best 100 of N lists of 100, cached for a second. A rank is N parallel `ZCOUNT` calls, each O(log n), added together.',
          },
          {
            label: 'Split by score range: one node for the top scores, others for lower bands',
            why: 'A rank is local plus the sizes of the bands above, but every strong player lands on the top node, so the busiest node is the one everyone watches. Band edges must move as scores inflate, and a player who improves moves between nodes.',
          },
          {
            label: 'Keep exact ranks only for the top, and a histogram of score buckets for everyone else',
            why: 'Defensible, and many games do show "top 12%" below a cutoff. Rank is the count in the buckets above plus a guess inside the bucket, cheap at any scale. The trade-off is that the rank a mid-table player sees is approximate.',
          },
          {
            label: 'Put the board in Redis Cluster and let it spread the data',
            why: 'Redis Cluster shards by key, and a sorted set is one key, so the whole board still lives on one node. Moving that node means migrating one huge key.',
          },
        ],
      },
      points: [
        'Before splitting, check the numbers: 8 GB and 25,000 writes a second fit one Redis primary, and replicas absorb the neighbour reads. Split the boards across nodes (all time on one, today on another) long before splitting one board.',
        'With N shards, a rank costs N round trips in parallel, so latency is the slowest shard. Keep N small (8 or 16), and cache the counts of the top few thousand scores for a second, since most rank queries cluster there.',
        'The top list is exact: every global top 100 player is in the top 100 of their own shard, so merging N lists of 100 loses nobody.',
        'Replace the tail with a histogram once exact ranks stop helping: rank 312,450,118 and rank 312,450,119 mean nothing to a player, and "top 63%" is honest and cheap.',
        'Many games avoid one giant board by design: leagues or divisions of a few dozen players, promoted and relegated each week, keep every board small and every rank meaningful. Raise it, but do not assume it.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Daily boards, weekly boards and cheaters',
      prompt:
        'The daily board resets at midnight, and the weekly board pays rewards to the top 1,000 on Monday. Someone posts a score ten times the world record. How do windows, resets and removals work?',
      decision: {
        question: 'How do you keep daily and weekly boards?',
        options: [
          {
            label: 'One sorted set per window, named by its period and set to expire after a retention period',
            best: true,
            why: 'A new day writes to a new, empty key, so a reset is free and needs no mass delete. The closed key stays readable for rewards and disputes until it expires.',
          },
          {
            label: 'One board with a timestamp per entry, filtered to the window when read',
            why: 'A sorted set orders by one score, so it cannot rank only the entries from today without scanning them all. A rank inside a window would cost a full scan.',
          },
          {
            label: 'A rolling last-24-hours board rebuilt every minute from 24 hourly sets with `ZUNIONSTORE`',
            why: 'Gives a true rolling window, and works for small boards. Merging tens of millions of entries every minute is a large, repeated job, and a player cannot tell when their score will drop off.',
          },
        ],
      },
      points: [
        'Name keys by period, such as `lb:d:2026-09-28` and `lb:w:2026-W40`, and attribute a result by the match end time, not the arrival time, so a match that ends at 23:59:58 counts for that day even if it arrives late.',
        'Pick one reset time for everyone (often midnight UTC) or keep separate boards per region; a board that resets at the local midnight of each player has no single ranking to show.',
        'Close a window with a grace period of a few minutes for late results, then snapshot the final standings to the durable store before paying rewards. Expire old keys with lazy freeing on (`lazyfree-lazy-expire`) or delete them with `UNLINK`, since freeing a 3 GB set inline blocks Redis.',
        'Cheating: check results for plausibility (points per second of play, score against the player history), and have game servers keep inputs or replays for top results, so the top 100 can be verified before rewards. Device attestation (Play Integrity, App Attest) raises the cost of modified clients.',
        'Removing a cheater is `ZREM` on every board plus a flag in the durable store so replays skip them; everyone below moves up by itself. Some games shadow-ban instead: the cheater still sees their own entry, nobody else does, so they learn nothing.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'You have five minutes left. What would you raise before the interviewer does?',
      points: [
        'Failure: Redis replicates asynchronously, so a failover can lose the last second of updates. The stream offsets let consumers replay from a checkpoint, and absolute writes make the replay safe. A lost node is rebuilt from the durable store.',
        'Multi-region: a global board needs one home for its sorted sets. Other regions forward results there and read from local replicas a little behind, which the second of lag we allowed already covers.',
        'Hot moments: an event start or a daily reset brings everyone to the same screen at once. The cached top 100 absorbs it; rate limit neighbour queries per player so a stuck client cannot poll every 100 ms.',
        'Monitoring: result stream lag, time from result to visible rank, Redis memory and command latency, the number of results rejected as implausible, and an audit comparing a sample of board scores with the durable totals.',
      ],
    },
  ],
  pitfalls: [
    'Computing ranks with `ORDER BY` and `COUNT(*)` on a database table, which scans millions of rows for a mid-table player.',
    'Trusting a score posted by the client, even when it is signed with a key that ships in the app.',
    'Applying results with `ZINCRBY`, so a retried or replayed update counts the points twice.',
    'Leaving ties to Redis, which orders equal scores by player ID, instead of choosing and explaining a rule.',
    'Resetting a daily board by deleting millions of entries at midnight, instead of starting a new key per period.',
  ],
  followUps: [
    {
      question: 'Players want a friends leaderboard. How do you build it?',
      answer:
        'Friend lists are small (a few hundred at most), so do not keep a sorted set per player. Fetch the friend IDs, read their scores from the global board in one `ZMSCORE` call, and sort them in the server. It is always current and costs one call per view.',
    },
    {
      question: 'A cheater is found after the weekly rewards were paid. What happens?',
      answer:
        'Remove them from the boards and flag them in the durable store. The snapshot taken at close is the record of what was paid, so recompute the final standings without the cheater, revoke their reward, and grant the players who move into reward places theirs, rather than rewriting history silently.',
    },
    {
      question: 'Product wants rank history: "you were 5,000th last week, 3,200th now". What do you store?',
      answer:
        'Do not rank every player every hour. Store the rank of each player at each window close from the snapshot you already take, and compute the current rank live when asked. For the top players, sample ranks every few minutes into a time series for charts.',
    },
  ],
};
