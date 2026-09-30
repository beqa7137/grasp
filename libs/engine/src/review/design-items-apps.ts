import { fmt } from '../sysdesign/scenario-catalog.js';
import { concept, item, type DesignItemDefinition } from './design-item-kit.js';
import { pick, withChoices } from './random.js';
import type { DesignItemId } from './summaries.js';

const offsetRows = item('Rows read for a deep page', (rand) => {
  const size = pick(rand, [20, 25, 50, 100]);
  const page = pick(rand, [40, 200, 1000, 5000]);
  const rows = (v: number) => `about ${fmt(v)} rows`;
  return {
    prompt: `An API lists orders newest first with \`LIMIT ${size} OFFSET n\`. A client asks for page ${fmt(page)}. Roughly how many index entries does the database read to answer that one request?`,
    ...withChoices(rand, rows(page * size), [rows(size), rows(page), rows((page * size) / 2)]),
    explain: `An offset is not a jump: the database walks past every skipped row, so page ${fmt(page)} reads ${fmt(page - 1)} × ${size} skipped rows plus the ${size} it returns, about ${fmt(page * size)}. A cursor (the last \`(created_at, id)\` pair seen) seeks straight to the next row and reads about ${size}.`,
  };
});

const idempotencyKey = concept(
  'A mobile client sends POST /payments, the connection drops before the response arrives, and the client retries. How do you make sure the customer is charged once?',
  'The client sends the same idempotency key on both tries; the server stores the first result under it and returns it again',
  [
    'The server rejects any second payment for the same amount within a minute',
    'The client waits longer before retrying, so the first request surely finished',
    'Switch the endpoint to PUT, since PUT requests are never processed twice',
  ],
  'The client cannot tell whether the first request failed or only its response was lost. A client-generated key, recorded before the charge and passed on to the card processor, with the outcome stored under it, turns the retry into a lookup. Amount-based deduplication blocks legitimate repeat purchases, and waiting longer never makes the retry safe.',
);

const compatibleChange = concept(
  'Which change to a public JSON API is backward compatible for clients that already exist?',
  'Adding an optional field to a response',
  ['Adding a required field to a request', 'Renaming a response field to a clearer name', 'Changing an ID field from a number to a string'],
  'Existing clients ignore fields they do not know, so additive, optional changes are safe. Requiring new input, renaming or retyping a field breaks clients that were written against the old shape; those need a new version or a long deprecation with both shapes served.',
);

const bcryptCost = item('Raising the bcrypt cost', (rand) => {
  const from = pick(rand, [10, 11, 12]);
  const step = pick(rand, [1, 2, 3]);
  const times = (v: number) => `${fmt(v)} times as long`;
  return {
    prompt: `A service raises its bcrypt cost factor from ${from} to ${from + step}. How much longer does an attacker need to try the same list of guesses against a stolen hash?`,
    ...withChoices(rand, times(2 ** step), [times(3 * step), times(2 ** (step + 1)), times(10 * step)]),
    explain: `The cost factor is the base-2 logarithm of the number of rounds, so each step doubles the work: ${step} step${step > 1 ? 's' : ''} means 2^${step} = ${2 ** step} times as long, for the attacker and for every login. Choose the highest cost that keeps a login within your latency budget, and raise it as hardware gets faster.`,
  };
});

const saltPurpose = concept(
  'Passwords are hashed with a unique random salt per user. What does the salt protect against?',
  'Precomputed tables and cracking many users at once: each hash must be attacked separately',
  [
    'Guessing one user password, since the salt makes each guess much slower',
    'A leak of the database, since the salt is kept secret on another server',
    'Weak passwords, since a salt adds randomness to what the user typed',
  ],
  'A salt is stored next to the hash and is not secret. It makes identical passwords hash differently, so rainbow tables are useless and an attacker pays for every guess once per user. It does not slow down an attack on one account: that is the job of a slow hash such as bcrypt, scrypt or Argon2id, and a weak password stays weak.',
);

const objectOwnership = concept(
  'A signed-in user changes the URL from /invoices/1041 to /invoices/1042 and sees another customer invoice. What is the fix?',
  'Check on every request that the invoice belongs to the caller before returning it',
  [
    'Replace the numeric IDs with random UUIDs so they cannot be guessed',
    'Hide the invoice ID from the URL and pass it in the request body',
    'Require the user to sign in again before viewing any invoice',
  ],
  'This is an insecure direct object reference: authentication proved who the user is, but nothing checked what they may read. Unguessable IDs make the hole harder to find, not closed, since IDs leak through links, logs and shared screens. Authorize each object access on the server, ideally by scoping the query to the owner.',
);

const coordinatorCrash = concept(
  'In two-phase commit, every participant has voted yes and is prepared. The coordinator crashes before sending the decision. What do the participants do?',
  'Wait, holding their locks, until the coordinator (or its log) says commit or abort',
  [
    'Commit on their own after a timeout, since everyone voted yes',
    'Abort on their own after a timeout, since no decision arrived',
    'Ask each other and commit if a majority of participants agrees',
  ],
  'A prepared participant has promised to commit if told to, so it may not abort alone, and it cannot commit alone either, because it does not know the other votes and the coordinator may already have decided to abort. It blocks with its locks held. That is the classic weakness of two-phase commit; replicating the coordinator log with consensus (as Spanner does) removes the single point that blocks.',
);

const outboxPattern = concept(
  'An order service writes the order to its database and then publishes an OrderPlaced event to Kafka. Sometimes orders exist with no event. What is the standard fix?',
  'Write the event to an outbox table in the same database transaction, and let a relay or CDC publish it',
  [
    'Publish the event first, then write the order, so the event is never missing',
    'Retry the publish in the request handler until Kafka acknowledges it',
    'Wrap the database write and the publish in a distributed transaction with the broker',
  ],
  'Two separate writes can never be atomic: a crash between them loses one, whichever comes first. The outbox makes the event part of the same local transaction as the order, and a relay (or change data capture on the table) publishes it at least once, so consumers must deduplicate by event id.',
);

const sagaCompensations = item('Compensations after a saga step fails', (rand) => {
  const steps = pick(rand, [4, 5, 6]);
  const failAt = pick(rand, [2, 3, steps]);
  const n = (v: number) => `${v} compensation${v === 1 ? '' : 's'}`;
  return {
    prompt: `An order saga has ${steps} steps, each a local transaction in a different service. Step ${failAt} fails and its own transaction rolls back. How many compensating actions must run?`,
    ...withChoices(rand, n(failAt - 1), [n(failAt), n(failAt + 1), n(2 * failAt)]),
    explain: `Steps 1 to ${failAt - 1} already committed, so each needs its compensation, run in reverse order: ${failAt - 1}. Step ${failAt} rolled back locally, and later steps never ran. Until the compensations finish, other readers can see the half-done order, which is why sagas mark records as pending.`,
  };
});

const hotReducer = item('Data on the busiest reducer', (rand) => {
  const data = pick(rand, [100, 500, 1000]);
  const reducers = pick(rand, [10, 50, 100]);
  const hot = pick(rand, [0.1, 0.2, 0.3]);
  const busiest = data * (hot + (1 - hot) / reducers);
  const gb = (v: number) => `about ${fmt(Math.round(v))} GB`;
  return {
    prompt: `A job shuffles ${fmt(data)} GB to ${reducers} reducers by key. One key holds ${Math.round(hot * 100)}% of the records; the rest spread evenly. How much data does the busiest reducer get?`,
    ...withChoices(rand, gb(busiest), [gb(data / reducers), gb(busiest * 2), gb(data / 2)]),
    explain: `All ${Math.round(hot * 100)}% of the hot key lands on one reducer (${fmt(Math.round(data * hot))} GB), plus its even share of the rest, ${fmt(Math.round((data * (1 - hot)) / reducers))} GB: about ${fmt(Math.round(busiest))} GB. The job waits for that reducer, and more reducers cannot split one key; salt the key or aggregate in two stages.`,
  };
});

const combinerUse = concept(
  'Which aggregation can safely use a combiner, pre-aggregating on each mapper before the shuffle?',
  'A count or sum per key, since partial sums add up to the total',
  [
    'A median per key, since each mapper can send its own median',
    'An average per key, sending each mapper average and averaging those',
    'Any aggregation, since the combiner runs on the same records as the reducer',
  ],
  'A combiner must be associative and commutative so partial results merge correctly: sums, counts, min and max work. An average of averages is wrong when mappers hold different counts (send sum and count instead), and a median cannot be merged from medians at all.',
);

const idempotentRerun = concept(
  'A daily job that appends the results for yesterday to a table fails halfway and is rerun. Some rows now appear twice. How should the job write its output?',
  'Build the day in a staging location and replace the partition for that day in one step',
  [
    'Append as before, but add a DISTINCT to every query that reads the table',
    'Retry each failed row individually until it succeeds',
    'Run the job with fewer workers so it fails less often',
  ],
  'A rerun must produce the same result as one clean run. Writing to staging and then overwriting the date partition atomically (or swapping a table pointer) makes the job idempotent: partial output never becomes visible, and a rerun simply replaces it. It also makes backfills safe.',
);

const geohashPrefix = concept(
  'Places are stored with a geohash, and a query looks up the cell prefix of the user location. Why does it also read the 8 neighboring cells?',
  'A nearby place can sit just across a cell edge, where its geohash has a different, often much shorter, shared prefix',
  [
    'Geohashes are approximate, so the user might be in a neighboring cell',
    'Neighboring cells hold copies of the places, which spreads the read load',
    'The prefix search misses the last character, which the neighbors restore',
  ],
  'Two points a few meters apart on either side of a cell boundary can have entirely different geohashes, especially across the big boundaries at the equator and the prime meridian. Reading the cell and its 8 neighbors at a precision whose cells are at least as wide as the radius covers the whole circle; then filter the candidates by true distance.',
);

const geohashPrecision = item('Geohash cells after one more character', (rand) => {
  const from = pick(rand, [4, 5, 6]);
  const even = from % 2 === 0;
  const fold = (v: number) => `${v} times as many`;
  return {
    prompt: `A service indexes places by geohash at precision ${from} and switches to precision ${from + 1}. Each character adds 5 bits, alternating longitude and latitude. Into how many smaller cells is each old cell split?`,
    ...withChoices(rand, fold(32), [fold(5), fold(10), fold(64)]),
    explain: `One base-32 character is 5 bits, so each cell splits into 2^5 = 32. Here the new character adds ${even ? '3 longitude bits and 2 latitude bits' : '2 longitude bits and 3 latitude bits'}, so cells get ${even ? '8 times narrower and 4 times shorter' : '4 times narrower and 8 times shorter'}. Cells stay close to square only every second character.`,
  };
});

const hotCell = concept(
  'Driver locations are sharded by geohash cell. Friday night, one downtown cell holds 20,000 drivers and its shard is overloaded. What fixes it best?',
  'Split dense areas into smaller cells, as a quadtree does, so shards follow load rather than area',
  [
    'Add read replicas to the downtown shard, since location updates are reads',
    'Raise the precision everywhere, making every cell in the world smaller',
    'Hash the driver id instead, so each driver lands on a random shard',
  ],
  'Fixed-size cells put a whole city center in one cell. An adaptive structure (a quadtree, or S2 and H3 cells chosen at several levels) splits a cell when it gets crowded, so dense areas get many small shards and empty ones few. Location updates are writes, and hashing by driver id makes every nearby search ask every shard.',
);

const pollingLoad = item('Requests from polling', (rand) => {
  const clients = pick(rand, [100_000, 500_000, 2_000_000]);
  const interval = pick(rand, [2, 5, 10]);
  const rps = (v: number) => `${fmt(v)} requests a second`;
  return {
    prompt: `${fmt(clients)} open app sessions poll the server every ${interval} s for new messages, although a message arrives only once a minute on average. How many requests a second does the server answer?`,
    ...withChoices(rand, rps(clients / interval), [rps(clients / 60), rps(clients * interval), rps(clients)]),
    explain: `Each client asks every ${interval} s whether or not anything happened: ${fmt(clients)} / ${interval} = ${fmt(clients / interval)} a second, most of them empty answers. A push connection sends a response only when there is a message, about ${fmt(Math.round(clients / 60))} a second here; long polling also answers once per timeout.`,
  };
});

const sseOrWebsocket = concept(
  'A live sports page sends score updates from server to browser and never needs to send anything back. Which transport fits most simply?',
  'Server-sent events: one long HTTP response the server writes to, with automatic reconnect',
  [
    'WebSockets, since only they can push from the server to the browser',
    'Short polling every second, since browsers limit open connections',
    'A WebSocket per game, opened and closed around each score change',
  ],
  'Server-sent events are one-way, plain HTTP, pass through most proxies, and the browser reconnects on its own and sends Last-Event-ID so the server can resend what was missed. WebSockets earn their extra machinery when the client sends often too, as in chat or games.',
);

const reconnectStorm = concept(
  'A gateway tier holding 2 million WebSocket connections is redeployed, and every client reconnects at once, overloading the login and presence services. What prevents this?',
  'Clients reconnect after a random, growing delay, and gateways drain connections gradually during a deploy',
  [
    'Clients reconnect immediately so users notice no gap',
    'Raise the connection timeout so clients never notice the deploy',
    'Switch clients to polling during deploys, which uses fewer connections',
  ],
  'Without jitter, every client that lost its connection at the same instant retries at the same instant, and again after each failure. Randomized exponential backoff spreads the retries, and draining a few percent of connections at a time during a deploy keeps the reconnect rate steady instead of a spike.',
);

const nPlusOne = item('Database wait for an N+1 page', (rand) => {
  const posts = pick(rand, [10, 20, 50]);
  const rtt = pick(rand, [1, 2, 5]);
  const ms = (v: number) => `${fmt(v)} ms`;
  return {
    prompt: `An ORM loads a page of ${posts} posts in one query, then loads each post's author in its own query as the page is rendered. Each query is a ${rtt} ms round trip. How long does the page wait on the database?`,
    ...withChoices(rand, ms((posts + 1) * rtt), [ms(rtt), ms(2 * rtt), ms(posts * posts * rtt)]),
    explain: `One query for the posts and one per author, one after another: (${posts} + 1) × ${rtt} = ${fmt((posts + 1) * rtt)} ms. A join returns posts and authors in one query (${rtt} ms); batching every author id into one \`WHERE id IN (...)\` query takes two (${2 * rtt} ms).`,
  };
});

const renameFanOut = item('Rows written by a denormalized rename', (rand) => {
  const posts = pick(rand, [500, 5_000, 50_000]);
  const rows = (v: number) => `${fmt(v)} rows`;
  return {
    prompt: `To serve the feed in one read, each post stores a copy of its author's display name. An author with ${fmt(posts)} posts changes their name. How many rows are written?`,
    ...withChoices(rand, rows(posts + 1), [rows(1), rows(2), rows(posts * 2)]),
    explain: `The author row, plus every post holding a copy: 1 + ${fmt(posts)} = ${fmt(posts + 1)}. Copying data speeds the read that needs it and moves the cost to every write that changes it; that rewrite usually runs in the background, so some pages show the old name until it finishes.`,
  };
});

const compositeIndex = concept(
  'A timeline query runs `WHERE user_id = ?` ordered by `created_at DESC` with `LIMIT 20`. Which index answers it without reading or sorting the whole user history?',
  'One index on `(user_id, created_at)`, read backwards from the newest entry',
  [
    'One index on `(created_at, user_id)`, filtered by user as it is read',
    'Two indexes, one on `user_id` and one on `created_at`, combined',
    'One index on `user_id` alone, since equality filters come first',
  ],
  "Columns tested for equality go first and the sort column after them: within one user the entries are already in time order, so the database reads the 20 newest and stops. With `created_at` first it walks everyone's posts in time order, and with `user_id` alone it reads and sorts all of that user's rows.",
);

const queueBound = item('Largest useful queue', (rand) => {
  const capacity = pick(rand, [500, 1_000, 2_000]);
  const timeout = pick(rand, [2, 3, 5]);
  const reqs = (v: number) => `about ${fmt(v)} requests`;
  return {
    prompt: `A service answers ${fmt(capacity)} requests a second, and its clients give up after ${timeout} s. Beyond what queue length is every newly queued request answered only after its client has given up?`,
    ...withChoices(rand, reqs(capacity * timeout), [reqs(capacity), reqs(capacity * timeout * 10), reqs(Math.round(capacity / timeout))]),
    explain: `A request that joins a queue of n waits n / ${fmt(capacity)} s. It is still wanted only while that stays under ${timeout} s, so a queue past ${fmt(capacity)} × ${timeout} = ${fmt(capacity * timeout)} holds only work no one is waiting for. Bound it there, or lower, and turn the rest away at once.`,
  };
});

const retryStorm = concept(
  'After a 5-minute outage, every client retries each failed call 3 times at once. The service comes back and falls over again within seconds. What breaks the cycle?',
  'A retry budget and exponential backoff with jitter, so retries stay a small share of traffic',
  [
    'More retries per call, so each request is more likely to get through',
    'A longer client timeout, so fewer calls count as failed and retried',
    'Retrying on a fixed 1-second interval, so the load arrives evenly',
  ],
  'Immediate retries can multiply traffic by up to 4 when the service is weakest, which keeps it down: a metastable failure. Backoff spreads retries out, jitter stops clients from retrying in step, and a budget (say retries at most 10% of requests) caps the extra load no matter how bad things get.',
);

const goodput = concept(
  'During a burst, a service runs at full CPU and answers as many requests a second as ever, yet nearly every user sees a timeout. What is happening?',
  'Its queue grew so long that it spends its time answering requests whose clients already left',
  [
    'Its CPU is too slow, so it answers fewer requests than before the burst',
    'Its clients time out too early, so the answers are fine but ignored',
    'Its network is saturated, so the answers never leave the machine',
  ],
  'Throughput holds, but goodput, the answers someone still waits for, collapses: an unbounded first-in-first-out queue serves the oldest requests first, and those are the ones that timed out. Bounding the queue, dropping requests past their deadline, or serving newest first under overload keeps the work that still matters.',
);

const leaseFailover = item('Lock unheld after a crash', (rand) => {
  const ttl = pick(rand, [10, 15, 30]);
  const renew = pick(rand, [2, 3, 4]);
  const sec = (v: number) => `${v} s`;
  return {
    prompt: `A client holds a lock lease of ${ttl} s and renews it every ${renew} s. It crashes just after a renewal. How long before another client can take the lock?`,
    ...withChoices(rand, sec(ttl), [sec(renew), sec(ttl - renew), sec(2 * ttl)]),
    explain: `The lock service cannot tell a crash from a slow client, so the lease stays valid for its full ${ttl} s after the last renewal. A shorter lease fails over sooner but expires more often under a pause or a slow network, and costs more renewals.`,
  };
});

const efficiencyLock = concept(
  'A nightly report job runs on three machines, and a lock should stop it running twice. A rare double run only emails a duplicate report. What does the lock need?',
  'A simple lease on one Redis node: a rare double run costs little, so it need not be airtight',
  [
    'A consensus-backed lock with fencing, since any double run is a correctness bug',
    'No lease at all, so the lock is released only when the job says it has finished',
    'A lock held on a majority of five Redis nodes, taken with a very long lease',
  ],
  'Ask what a double holder costs. A lock for efficiency saves duplicate work, and an occasional failure is acceptable, so one Redis key with a lease is enough. A lock for correctness, where two holders corrupt data, needs a consensus system and fencing tokens checked by the store. A lock with no lease stays held forever if its holder dies.',
);

const conditionalWrite = concept(
  'Two workers may update the same account balance at once. Which avoids a lock service and still loses no update?',
  'A conditional write, such as `WHERE version = 7`, retried when it matches no row',
  [
    'Each worker reads the balance and writes the new one straight after',
    'A lock kept in the worker’s memory, taken before every update',
    'Updates spaced at least one second apart by the two workers',
  ],
  'Compare-and-set makes the database the arbiter: the update applies only if the row is still the version the worker read, and a worker that lost the race rereads and retries. Read-then-write loses one update when both read the same value, and an in-memory lock protects nothing across machines.',
);

const slowServerLoad = item('A slow server under round-robin', (rand) => {
  const servers = pick(rand, [5, 10, 20]);
  const slowdown = pick(rand, [2, 4, 5]);
  const load = pick(rand, [0.5, 0.6, 0.7]);
  const busy = load * ((slowdown * (servers - 1) + 1) / servers);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return {
    prompt: `${servers} servers sit behind a round-robin balancer. One is ${slowdown} times slower than the rest. The fleet as a whole runs at ${pct(load)} of what it can answer. How busy is the slow server?`,
    ...withChoices(rand, pct(busy), [pct(load), pct(load / slowdown), pct(load * slowdown * 2)]),
    explain: `Round-robin sends it 1 / ${servers} of the traffic, the same as every other server, but it can answer only 1 / ${slowdown} as much. Its utilization is ${load} × (${slowdown} × ${servers - 1} + 1) / ${servers} = ${pct(busy)}${busy > 1 ? ': past 100%, so its queue grows until requests time out' : ''}. Balancers that count in-flight requests send it less as its queue builds.`,
  };
});

const twoChoices = concept(
  'Fifty load balancers each send new requests to the backend with the fewest open connections, using load figures that are a second old. Backends take turns being swamped. What fixes it?',
  'Each balancer picks two backends at random and sends to the less loaded one',
  [
    'Each balancer asks every backend for its load before each request',
    'All fifty balancers switch to plain round-robin across backends',
    'Each balancer adds more backends to its list of candidates',
  ],
  'With stale figures every balancer sees the same least-loaded backend and they all pile onto it at once, a herd. Two random choices keep most of the benefit of picking a lightly loaded backend (the longest queue grows like log log n rather than log n / log log n for one random pick) while spreading balancers across different candidates.',
);

const fastFailures = concept(
  'One backend has a full disk and answers every request with an error in 2 ms, while healthy ones take 40 ms. Under least connections it gets more traffic than any other. Why, and what fixes it?',
  'Failing fast leaves it the fewest open requests; eject backends whose error rate spikes',
  [
    'Least connections counts errors as open requests, so drop it for round-robin',
    'The healthy backends are overloaded, so add more of them to the pool',
    'The balancer caches its choice, so shorten the cache to one second',
  ],
  'Least connections reads few open requests as spare capacity, and nothing finishes faster than an error. Passive health checking (outlier ejection) watches each backend’s error rate and latency and takes it out of rotation for a while; active health checks that exercise the disk would catch it too.',
);

const clockSkew = item('Worst skew between two synced clocks', (rand) => {
  const error = pick(rand, [5, 10, 20]);
  const ppm = pick(rand, [20, 50, 100]);
  const poll = pick(rand, [64, 256, 1024]);
  const drift = (ppm * poll) / 1000;
  const ms = (v: number) => `${v.toFixed(1)} ms`;
  return {
    prompt: `Two servers sync to NTP every ${poll} s, each to within ${error} ms, and their clocks drift by up to ${ppm} ppm between syncs. How far apart can their clocks be just before the next sync?`,
    ...withChoices(rand, ms(2 * (error + drift)), [ms(error), ms(error + drift), ms(2 * error)]),
    explain: `Each clock can be off by the sync error plus the drift since, ${ppm} ppm × ${poll} s = ${drift.toFixed(1)} ms: up to ${(error + drift).toFixed(1)} ms. One can be ahead and the other behind, so they can be twice that apart, ${(2 * (error + drift)).toFixed(1)} ms. Two writes closer together than that cannot be ordered by timestamp.`,
  };
});

const monotonicClock = concept(
  'A service logs how long each request took by subtracting two wall-clock readings. A few requests report negative durations. Why, and what fixes it?',
  'NTP stepped the wall clock back mid-request; time durations with a monotonic clock',
  [
    'The requests ran on two cores whose clocks differ, so pin each request to one core',
    'The timer resolution is too coarse, so measure in nanoseconds instead',
    'Leap seconds shift the clock, so convert both readings to UTC first',
  ],
  'The wall clock can jump when NTP corrects it (or be set by hand), so the difference between two readings can be negative or wildly large. A monotonic clock only moves forward at a steady rate and has no meaning as a date, which is exactly what a duration needs.',
);

const concurrentWrites = concept(
  'Two replicas of a shopping cart accept writes while partitioned: one adds a book, the other adds a lamp. With last write wins by timestamp, one item vanishes. What keeps both?',
  'Version vectors that detect the writes as concurrent, kept as siblings and merged',
  [
    'Synchronizing the replicas’ clocks more tightly with NTP',
    'A Lamport clock, whose larger value marks the newer write',
    'Waiting a few milliseconds before each write to separate them',
  ],
  'Neither write saw the other, so neither is newer: any timestamp order, however precise, drops one. A version vector records what each replica has seen, so a reader can tell the writes are concurrent, keep both as siblings, and merge them (here, the union of the items). A Lamport clock orders them too, but cannot say they were concurrent.',
);

const registryStale = item('Traffic to a dead instance', (rand) => {
  const heartbeat = pick(rand, [5, 10, 15]);
  const missed = pick(rand, [2, 3]);
  const cache = pick(rand, [25, 40]);
  const sec = (v: number) => `${v} s`;
  return {
    prompt: `Instances heartbeat to a registry every ${heartbeat} s and are removed after ${missed} missed heartbeats. Clients refresh their cached list every ${cache} s. At worst, how long do clients keep sending to an instance that crashed?`,
    ...withChoices(rand, sec(heartbeat * missed + cache), [sec(heartbeat), sec(heartbeat * missed), sec(cache)]),
    explain: `The registry notices after ${missed} × ${heartbeat} = ${heartbeat * missed} s of silence, and a client that refreshed just before that keeps the old list for up to ${cache} s more: ${heartbeat * missed + cache} s. Shorter heartbeats and refreshes cut it, at the cost of more traffic to the registry and more false removals during pauses.`,
  };
});

const readiness = concept(
  'A service needs 60 s after starting to load its cache, and answers slowly until then. Which check keeps traffic away during that time without restarting it?',
  'A readiness check that fails until the cache is loaded, taking it out of rotation',
  [
    'A liveness check that fails until the cache is loaded, so it restarts cleanly',
    'A longer client timeout, so the slow answers during warm-up still arrive',
    'A deep health check that also queries the database the cache loads from',
  ],
  'Readiness answers "should I get traffic now?" and liveness answers "should I be restarted?". A failing liveness check during warm-up would restart the instance before it ever finished loading, forever. Readiness removes it from the load balancer until it can serve well.',
);

const deepCheck = concept(
  'Every instance’s health check also runs a query against the shared database. The database slows down for a minute. What happens next?',
  'Every instance fails its check at once and the load balancer removes them all',
  [
    'Only the instances whose queries were slow are removed, as intended',
    'The database recovers sooner because health checks stop querying it',
    'Nothing changes, since health checks run apart from real traffic',
  ],
  'A check that depends on a shared dependency fails everywhere at the same moment, turning a slow database into a full outage. Keep health checks shallow (can this process serve?), and handle a failing dependency inside the request path, by degrading or failing that request.',
);

const erasureOverhead = item('Space and safety of an erasure code', (rand) => {
  const data = pick(rand, [6, 10, 12]);
  const parity = pick(rand, [2, 3, 4]);
  const raw = (data + parity) / data;
  const answer = (tb: number, survives: number) => `${tb.toFixed(2)} TB, survives any ${survives} lost`;
  return {
    prompt: `An object store cuts each object into ${data} data pieces and adds ${parity} parity pieces, each on a different disk; any ${data} of the ${data + parity} rebuild it. For every 1 TB of data, how much raw disk does it use, and how many disk losses does an object survive?`,
    ...withChoices(rand, answer(raw, parity), [answer(raw, data), answer(3, 2), answer(raw, Math.floor(parity / 2))]),
    explain: `It stores ${data + parity} pieces the size of 1/${data} of the object: ${data + parity} / ${data} = ${raw.toFixed(2)} TB per TB. Since any ${data} pieces rebuild the object, it survives losing any ${parity}. Three full copies would use 3 TB and survive only 2.`,
  };
});

const repairTraffic = concept(
  'A storage cluster moves cold data from three copies to 10 + 4 erasure coding. Disk failures now keep the network busy for far longer. Why?',
  'Rebuilding one lost piece reads 10 surviving pieces, where a copy needed one',
  [
    'Erasure-coded disks fail more often, since each holds pieces of more objects',
    'Parity pieces are larger than data pieces, so rebuilding them moves more bytes',
    'The rebuilt piece must be written to all 14 disks, not just one',
  ],
  'To recompute a lost piece the system reads any 10 of the survivors, ten times the bytes of copying one replica. That repair traffic is why codes such as Azure’s locally repairable codes add local parity, so most repairs read a small group instead of the whole stripe.',
);

const failureDomains = concept(
  'A team keeps three copies of every object, all on disks in the same rack for fast writes. Why is their real durability far below the nines their model promises?',
  'One rack failure, a switch or a power feed, loses all three copies at once',
  [
    'Disks in one rack wear out faster because they share the same airflow',
    'Three copies in a rack must be written one after another, so writes get lost',
    'The model counts parity pieces, which a rack of copies does not have',
  ],
  'Durability models assume pieces fail independently. Anything shared, a rack, a power feed, a batch of disks from one factory run, a software bug, fails them together. Spreading pieces across racks, rooms or zones keeps one fault from taking several.',
);

const restoreTime = item('How long a restore takes', (rand) => {
  const size = pick(rand, [500, 2_000, 6_000]);
  const speed = pick(rand, [5, 10, 20]);
  const min = (v: number) => `${fmt(v)} min`;
  return {
    prompt: `A ${fmt(size)} GB database is lost with its disks at 11 pm. The only copy is last night's full backup, which restores at ${speed} GB a minute. How long until the database can serve again, ignoring everything but the restore?`,
    ...withChoices(rand, min(size / speed), [min(size / speed / 2), min((size / speed) * 2), min(24 * 60)]),
    explain: `Restoring copies every byte back: ${fmt(size)} / ${speed} = ${fmt(size / speed)} min, the recovery time (RTO). The writes since last night's backup, nearly a day of them, are gone: that is the recovery point (RPO). Measure restores in drills, since real ones add verification and catch-up.`,
  };
});

const replicaNotBackup = concept(
  'Someone runs a delete without a WHERE clause on the primary. The team has a synchronous standby in another zone. What does the standby hold a second later?',
  'The same empty table, since it copies every change, mistakes included',
  [
    'The rows as they were, since standbys ignore deletes they did not start',
    'The rows as they were, since synchronous replication waits for approval',
    'Half the rows, since only the committed part of the delete reached it',
  ],
  'Replication protects against losing a machine, not against a bad change: the delete is a valid write and replicas apply it faithfully. Undoing it needs a copy from before the mistake, a backup restored to a point in time just before it, or a replica deliberately kept hours behind.',
);

const restoreDrill = concept(
  'A company has taken nightly backups for two years and never restored one. What is the most important thing to do?',
  'Restore one on a schedule, time it, and check the data, since untested backups often fail',
  [
    'Keep more backups, so there are more to choose from when one is needed',
    'Encrypt the backups, since an unencrypted backup is the largest risk',
    'Move the backups to faster storage, so a future restore is quicker',
  ],
  'A backup counts only once it has been restored. Drills find missing tables, expired credentials, backups that silently stopped, and restores that take far longer than anyone assumed, and they give the real RTO to plan around.',
);

const noisyShare = item('What a quiet tenant gets from a shared pool', (rand) => {
  const quiet = pick(rand, [40, 50, 60]);
  const total = pick(rand, [2_000, 2_500, 4_000]);
  const noisy = total - 9 * quiet;
  const served = (1_000 / total) * 100;
  const pct = (v: number) => `${v}%`;
  const count = (v: number) => v.toLocaleString('en-US');
  return {
    prompt: `Ten tenants share a pool that serves 1,000 requests a second, first come, first served. Nine send ${quiet} a second each; one runs a batch job at ${count(noisy)} a second. What share of a quiet tenant's requests get served?`,
    ...withChoices(rand, pct(served), [pct(100), pct(served / 2), pct(10)]),
    explain: `Demand is ${count(9 * quiet)} + ${count(noisy)} = ${count(total)} a second against 1,000 of capacity, and first come, first served drops requests in proportion to demand, so every tenant gets 1,000 / ${count(total)} = ${served}%. The quiet tenants asked for far less than a tenth each and still lose the same share as the batch job: the noisy neighbor problem.`,
  };
});

const fairSharing = concept(
  "One tenant's nightly batch job slows every other customer on a shared database. Which policy contains it without leaving capacity idle?",
  'Fair sharing: each busy tenant gets an equal share, and spare capacity flows to whoever wants it',
  [
    'A fixed quota per tenant, enforced even when the rest of the pool is idle',
    'First come, first served, with a bigger pool sized for the batch job',
    'Retries with backoff for the quiet tenants, so their requests get through',
  ],
  'A hard quota protects the quiet tenants but idles capacity the batch job could have used at night. Fair sharing (weighted fair queuing, per-tenant queues served in turn) gives every quiet tenant all it asks for, up to its equal share, then hands the rest to the batch job. A bigger pool only raises the bar the next burst clears.',
);

const tenantCells = concept(
  'Why split customers into cells, each a full copy of the stack serving a slice of the tenants?',
  'A bad deploy or a poison tenant takes down one cell, not every customer',
  [
    'Each cell can skip authentication, since its tenants trust one another',
    'Cells remove the need for backups, since every cell copies the others',
    'Requests get faster, since a cell answers from memory instead of disk',
  ],
  'A cell caps the blast radius: a tenant whose traffic or data crashes the service, or a deploy rolled out one cell at a time, hurts only that slice. The costs are a routing layer that maps each tenant to its cell and work to move a tenant that outgrows one.',
);

const introspectionLoad = item('Load a token check puts on the auth server', (rand) => {
  const rps = pick(rand, [2_000, 5_000, 20_000]);
  const hit = pick(rand, [90, 99]);
  const calls = (rps * (100 - hit)) / 100;
  const perSecond = (v: number) => `${fmt(v)} calls/s`;
  return {
    prompt: `A gateway checks each of ${fmt(rps)} requests a second by asking the auth server whether the token is valid (introspection), and caches answers for a minute. ${hit}% of checks hit the cache. How many calls a second reach the auth server?`,
    ...withChoices(rand, perSecond(calls), [perSecond(rps), perSecond((rps * hit) / 100), perSecond(0)]),
    explain: `Only misses call out: ${fmt(rps)} × ${100 - hit}% = ${fmt(calls)} a second. The cache trades freshness for load, since a revoked token keeps working until its cached answer expires. A signed JWT checked locally makes no calls at all, with the same trade-off tied to the token's lifetime.`,
  };
});

const jwtRevocation = concept(
  "An admin revokes a user's access. The gateway only checks JWT signatures, and the user's token has 50 minutes left. What happens?",
  'The token keeps working until it expires, unless something checks a denylist',
  [
    'The token stops working at once, since revoking it changes its signature',
    'The gateway asks the auth server on the next request and rejects it',
    'The token works for exactly one more request, then the key rotates',
  ],
  'A JWT is valid wherever its signature and expiry check out, so revocation needs extra work: short lifetimes (minutes) with refresh tokens, a denylist of revoked token ids that the gateway checks, or introspection for the few routes where instant revocation matters.',
);

const meshCost = concept(
  'A request passes through five services, and a service mesh puts a sidecar proxy beside each one. What does that cost?',
  'Two proxy hops per call, a little latency each, plus CPU and memory per pod',
  [
    'Nothing measurable, since sidecars share the kernel with their service',
    'One extra network round trip for the whole request, at the gateway only',
    'Only config work, since proxies sit off the path and observe traffic',
  ],
  'Every call leaves through one sidecar and enters through another, so five services mean ten proxy passes, each adding a fraction of a millisecond or more under load, and every pod reserves CPU and memory for its proxy. The mesh pays off when many services need mTLS, retries and tracing done the same way.',
);

export const APP_ITEMS = {
  'offset-rows': offsetRows,
  'idempotency-key': idempotencyKey,
  'compatible-change': compatibleChange,
  'bcrypt-cost': bcryptCost,
  'salt-purpose': saltPurpose,
  'object-ownership': objectOwnership,
  'coordinator-crash': coordinatorCrash,
  'outbox-pattern': outboxPattern,
  'saga-compensations': sagaCompensations,
  'hot-reducer': hotReducer,
  'combiner-use': combinerUse,
  'idempotent-rerun': idempotentRerun,
  'geohash-neighbors': geohashPrefix,
  'geohash-precision': geohashPrecision,
  'hot-cell': hotCell,
  'polling-load': pollingLoad,
  'sse-or-websocket': sseOrWebsocket,
  'reconnect-storm': reconnectStorm,
  'n-plus-one': nPlusOne,
  'rename-fan-out': renameFanOut,
  'composite-index': compositeIndex,
  'queue-bound': queueBound,
  'retry-storm': retryStorm,
  goodput,
  'lease-failover': leaseFailover,
  'efficiency-lock': efficiencyLock,
  'conditional-write': conditionalWrite,
  'slow-server-load': slowServerLoad,
  'two-choices': twoChoices,
  'fast-failures': fastFailures,
  'clock-skew': clockSkew,
  'monotonic-clock': monotonicClock,
  'concurrent-writes': concurrentWrites,
  'registry-stale': registryStale,
  readiness,
  'deep-check': deepCheck,
  'erasure-overhead': erasureOverhead,
  'repair-traffic': repairTraffic,
  'failure-domains': failureDomains,
  'restore-time': restoreTime,
  'replica-not-backup': replicaNotBackup,
  'restore-drill': restoreDrill,
  'noisy-share': noisyShare,
  'fair-sharing': fairSharing,
  'tenant-cells': tenantCells,
  'introspection-load': introspectionLoad,
  'jwt-revocation': jwtRevocation,
  'mesh-cost': meshCost,
} satisfies Partial<Record<DesignItemId, DesignItemDefinition>>;
