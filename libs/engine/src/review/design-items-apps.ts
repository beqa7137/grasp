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
} satisfies Partial<Record<DesignItemId, DesignItemDefinition>>;
