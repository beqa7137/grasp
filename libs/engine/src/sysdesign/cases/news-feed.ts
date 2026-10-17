import type { CaseStudy } from './types.js';

export const NEWS_FEED: CaseStudy = {
  id: 'news-feed',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt: 'A feed can mean many things. Which questions pin down the problem?',
      decision: {
        question: 'Which question narrows this design the most?',
        options: [
          {
            label: 'Is the feed in time order, or ranked, and how fresh must it be?',
            best: true,
            why: 'Ordering and freshness decide whether you can precompute timelines, how long a post may take to appear, and whether a ranking service sits on the read path.',
          },
          {
            label: 'Can posts include images and video?',
            why: 'Useful, but media goes to object storage and a CDN either way; it barely changes the feed design itself.',
          },
          {
            label: 'Should we use SQL or NoSQL?',
            why: 'A technology choice, not a requirement. Answer it later, from the access patterns.',
          },
          {
            label: 'Do users see ads?',
            why: 'Ads are inserted when the feed is served. It matters for the product, not for the core data flow.',
          },
        ],
      },
      points: [
        'Functional: publish a post, follow and unfollow people, read your home timeline newest first, page through older posts.',
        'Scale (from the interviewer): 300 million daily users, each opens the feed about 10 times a day and posts about once every two days.',
        'Freshness: a new post should reach followers within a few seconds; a short delay is fine, a lost post is not.',
        'Reads must be fast (under about 200 ms end to end) and the feed must keep working if a single component fails.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the reads',
      prompt: '300 million users open the feed 10 times a day. How many feed reads per second is that on average?',
      estimate: {
        question: 'Average feed reads per second',
        answer: 34_722,
        unit: 'reads/s',
        working: [
          'Feed opens per day: 300 million times 10 is 3 billion.',
          'Per second: 3,000,000,000 / 86,400 is about 35,000.',
          'Peaks run about twice the average: plan for about 70,000 feed reads per second.',
          'Posts: 300 million / 2 is 150 million a day, about 1,700 per second.',
        ],
      },
      points: [
        'About 35k feed reads/s on average and 70k at peak, against about 1.7k new posts/s.',
        'Reads outnumber posts by about 20 to 1, so doing work at write time to make reads cheap is attractive.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the fan-out',
      prompt:
        'If every post is copied into each follower timeline when it is published, and the average user has 200 followers, how many timeline inserts per second is that?',
      estimate: {
        question: 'Timeline inserts per second with fan-out on write',
        answer: 347_222,
        unit: 'inserts/s',
        working: [
          'Posts per second: about 1,736.',
          'Each post is inserted into 200 timelines: 1,736 times 200 is about 347,000 inserts per second.',
          'Each insert is tiny (a post ID and a timestamp), so this fits in an in-memory store, but it is 10 times the read rate.',
          'The average hides the tail: one account with 50 million followers turns a single post into 50 million inserts.',
        ],
      },
      points: [
        'Fan-out on write multiplies each post by its follower count: cheap reads, expensive and uneven writes.',
        'The follower distribution is extremely skewed, and that skew is the heart of this question.',
      ],
    },
    {
      kind: 'data',
      title: 'Model the data',
      prompt: 'Which stores do you need, and what does each one answer?',
      points: [
        'Posts: post ID, author, text, media links, created time. Sharded by post ID; read by ID in batches.',
        'Follows: who follows whom, stored both ways (followers of X, and people X follows), sharded by user.',
        'Timelines: for each user, a capped list of recent post IDs (say the latest 800), in an in-memory store. It holds IDs, not posts.',
        'Post IDs that sort by time (for example a timestamp in the high bits) make "newer than" and "older than" cheap everywhere.',
        'Size the timelines: 300 million users times 800 IDs times 8 bytes is about 2 TB before overhead, so a sharded in-memory cluster, not one node.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Fan-out on write or on read',
      prompt: 'When someone posts, do you push it into follower timelines now, or pull posts from followed accounts when a follower reads?',
      decision: {
        question: 'Which approach would you choose for this product?',
        options: [
          {
            label: 'Hybrid: push for most accounts, pull for the few with huge followings',
            best: true,
            why: 'Most reads become one cache lookup, and a celebrity post costs one write instead of millions. At read time the service merges in recent posts from the handful of big accounts the reader follows.',
          },
          {
            label: 'Always push (fan-out on write)',
            why: 'Reads are a single lookup, but one post from an account with 50 million followers queues 50 million inserts, delaying everyone behind it.',
          },
          {
            label: 'Always pull (fan-out on read)',
            why: 'Writes are trivial, but every feed open queries hundreds of followed accounts and merges them, at 70k opens per second. Reads become slow and expensive.',
          },
        ],
      },
      points: [
        'Publishing writes the post, then puts a fan-out job on a queue, so the author gets a response at once.',
        'Workers read the follower list in pages and append the post ID to each follower timeline.',
        'Accounts above a follower threshold (say 1 million) are skipped by fan-out; their posts are pulled and merged when a follower reads.',
        'Inactive users can be skipped too: their timeline is rebuilt by pulling when they return.',
        "Celebrity posts are read on millions of feed opens, a hot key on the pull path: replicate them across cache nodes or keep them in each app server's memory.",
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt: 'Trace a feed read and a post publish through the system.',
      lab: true,
      points: [
        'Read: load balancer, app server, timeline cache for post IDs, then a batched fetch of the posts (mostly from the post cache).',
        'Publish: app server writes the post to its shard, then enqueues a fan-out job; workers update the timelines.',
        'Media is served from a CDN and object storage, never through the app servers.',
        'Databases are sharded with a replica per shard, so a failed primary loses no data and reads continue during failover.',
        'Open the build in the Lab: it serves the average 35k requests per second. Push it to the 70k peak and find what gives first. The queue and workers stand for fan-out; the simulator counts each job once, not the 200 timeline inserts it makes. Kill a worker or a cache node and watch what happens.',
      ],
    },
    {
      kind: 'api',
      title: 'Page through the feed',
      prompt: 'The client asks for the next 20 posts. New posts arrive while the user scrolls. How do you page?',
      decision: {
        question: 'Which pagination would you use for the feed?',
        options: [
          {
            label: 'A cursor: return the last post ID seen, and ask for posts older than it',
            best: true,
            why: 'Stable while new posts arrive, and each page is a cheap range read on time-sortable IDs.',
          },
          {
            label: 'Page numbers with an offset',
            why: 'New posts shift every item, so the user sees duplicates or misses posts, and deep offsets make the store skip over many rows.',
          },
          {
            label: 'Send the whole timeline once and page on the client',
            why: 'Wastes bandwidth on posts nobody scrolls to, and the list is stale as soon as it arrives.',
          },
        ],
      },
      points: [
        '`GET /feed?cursor=<id>` returns the next 20 posts and a new cursor; the first call has no cursor.',
        'Pull to refresh asks for posts newer than the first ID on screen.',
        'Past the 800 cached IDs, fall back to pulling older posts from the accounts the user follows.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'What would you raise in the last five minutes?',
      points: [
        'Ranking: fetch a few hundred candidates from the timeline, score them with a ranking service, return the top 20; the chronological store stays the source.',
        'Deletes and unfollows: filter on read (drop posts that no longer exist or whose author is unfollowed) rather than rewriting every timeline immediately.',
        'Failure: if the fan-out queue backs up, posts appear late but none are lost; alert on queue age, not just queue length.',
        'Monitoring: feed read p99, fan-out lag (time from post to follower timeline) and cache hit rate.',
      ],
    },
  ],
  pitfalls: [
    'Choosing pure fan-out on write and never mentioning accounts with millions of followers.',
    'Storing whole posts in every timeline instead of post IDs, multiplying storage and making edits impossible.',
    'Offset pagination on a feed that changes while the user scrolls.',
    'Doing the fan-out inside the publish request, so a big account makes posting time out.',
  ],
  followUps: [
    {
      question: 'How would you add ranking without making the feed slow?',
      answer:
        'Precompute features offline, fetch a few hundred candidate IDs from the timeline cache, score them in one batched call to the ranking service with a strict time budget, and fall back to time order if it runs out.',
    },
    {
      question: 'A user follows 5,000 accounts. Does anything change?',
      answer:
        'Their timeline is still one cache read, since fan-out already happened on write. Only the pull-merge for celebrities grows, so cap how many big accounts are merged per read and cache that merge briefly.',
    },
    {
      question: 'How do you backfill a timeline for a user returning after a year?',
      answer:
        'Their cached timeline expired, so build it on demand: pull recent posts from the accounts they follow, merge and cache the result, and resume normal fan-out from then on.',
    },
  ],
};
