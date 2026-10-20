import type { CaseStudy } from './types.js';

export const RIDE_SHARING: CaseStudy = {
  id: 'ride-sharing',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt:
        '"Design Uber" covers pricing, payments, maps and more. Which part do you design, which numbers do you need, and what do you park?',
      points: [
        'Functional: drivers go online and stream their location; a rider sees nearby cars, requests a ride and is matched with one driver; both see each other move on the map until pickup, then the rider watches the trip.',
        'Trip lifecycle: request, driver accepts, driver arrives, trip starts, trip ends, and either side can cancel before the trip starts.',
        'Scale (from the interviewer): 1 million drivers online at the daily peak, worldwide, and 20 million trips a day.',
        'Non-functional: a match within seconds, the car on the map no more than a few seconds stale, and never two drivers for one trip or two trips for one driver.',
        'Out of scope unless asked: surge pricing, payments, the routing and ETA engine (treat it as a service that answers "how long from A to B"), pooled rides and food delivery.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the location stream',
      prompt:
        'Every online driver reports where they are. How often should they, and what write rate does that give at the peak of 1 million online drivers?',
      decision: {
        question: 'How often should an online driver app send its position?',
        options: [
          {
            label: 'About every 4 seconds while online',
            best: true,
            why: 'At 50 km/h a car moves about 56 m in 4 seconds, which is fresh enough to match and, with the app animating between points, to draw a smooth car. It keeps the write rate and the battery and data cost of the driver phone reasonable.',
          },
          {
            label: 'Every second',
            why: 'Smoother, and defensible for the driver on an active trip, but it multiplies the write rate by four for all online drivers, most of whom are idle and waiting, and drains the phone faster.',
          },
          {
            label: 'Only when the driver has moved more than 100 m',
            why: 'Defensible as a refinement, since a parked driver sends little, but the server can no longer tell a parked driver from a dead phone. It still needs a periodic heartbeat to prove the driver is online.',
          },
          {
            label: 'Every 30 seconds',
            why: 'At 50 km/h the car moves over 400 m between reports, so dispatch matches on stale positions and the car on the rider map jumps around.',
          },
        ],
      },
      estimate: {
        question: 'Location updates per second at peak',
        answer: 250_000,
        unit: 'updates/s',
        working: [
          'One update every 4 seconds is 0.25 updates a second per driver.',
          '1 million online drivers times 0.25 is 250,000 updates a second.',
          'At about 100 bytes each, that is 25 MB/s of incoming payload (200 Mbit/s).',
        ],
      },
      points: [
        'Ride requests are tiny next to that: 20 million trips / 86,400 is about 230 a second, perhaps 700 at the peak. Location updates outnumber ride requests more than 300 to 1.',
        'So the design has two paths with very different shapes: a firehose of small, short-lived position writes, and a low-rate, high-stakes path of trip requests and state changes.',
        'A position is worthless a few seconds later, so the firehose does not need durable, indexed database writes. A trip state change must never be lost.',
      ],
    },
    {
      kind: 'api',
      title: 'Talk to the phones',
      prompt: 'A driver must see a ride offer within a second, and a rider watches the car move. How do the phones and the servers talk?',
      decision: {
        question: 'How do updates reach the phones?',
        options: [
          {
            label:
              'A persistent connection per foreground app (WebSocket, or a gRPC or HTTP/2 stream), with push notifications when the app is in the background',
            best: true,
            why: 'The server can send an offer or a new driver position the moment it has one, and the driver app can send its location up the same connection. Push notifications (APNs, FCM) cover a backgrounded rider app, for events like "your driver has arrived".',
          },
          {
            label: 'The apps poll an HTTP endpoint every few seconds',
            why: 'Simple and a sound fallback when a connection cannot be held, but an offer waits up to a full poll interval, and most polls from idle drivers come back empty.',
          },
          {
            label: 'Push notifications for everything, including ride offers',
            why: 'Push delivery is best effort: the platforms can delay or drop notifications and throttle frequent ones, so an offer with a 15-second window may arrive late or never.',
          },
        ],
      },
      points: [
        'Driver app: sends `location` (lat, lng, heading, speed, accuracy, timestamp) on the connection; receives offers and answers them with accept or decline plus the offer ID.',
        'Rider app: `POST /trips` with pickup, drop-off, product type and an idempotency key, so a retried tap never books two rides; `POST /trips/{id}/cancel`.',
        "While matched, the rider's connection receives the driver's position and ETA, and the driver's receives the pickup pin and trip changes.",
        'Before requesting, the rider sees nearby cars: a query to the geo index every few seconds while the map is open, answered with a sample of positions, not every driver.',
        'The apps animate between points and snap them to the road, so 4-second updates look continuous. GPS on a phone is off by several meters, and much more between tall buildings.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt: 'Trace a driver location update into the system, then a ride request from a rider until one driver has accepted it.',
      lab: true,
      points: [
        'Gateways hold the phone connections and pass messages to stateless services. A location update goes to the location service, which updates the in-memory geo index for its region and appends the point to a log (such as Kafka) for trip tracking and history.',
        'A ride request goes to the trip service, which writes the trip as requested in the trip database, then hands it to the dispatch service for the pickup region.',
        "Dispatch reads the geo index for available drivers near the pickup, asks the ETA service to rank them, and offers the trip to the best one through the driver's gateway. On accept, the trip service records the match and both apps start receiving each other's positions.",
        'A small registry maps each connected user to the gateway holding their connection, as in chat, so any service can reach a phone.',
        'Open the build in the Lab: one large city at peak, 40,000 drivers online sending a position every 4 seconds (10,000 writes a second), plus 10,000 reads a second from rider map screens and dispatch lookups. The simulator has no persistent connections or geo queries: the app tier stands for the gateways and the location and dispatch services, the cache for reads from the in-memory geo index, the queue for the location log, the workers for the history writers and the database for trips and batched location history. Push it to 30,000 and see what runs hot first.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Index the drivers in memory',
      prompt:
        '"Available drivers within 2 km of this point" runs for every request and every map screen, while 250,000 positions change each second. What structure answers it, and where does it live?',
      decision: {
        question: 'Which index do you keep for driver positions?',
        options: [
          {
            label:
              'A grid of fixed hierarchical cells (H3 or S2) in memory: each driver maps to one cell and each cell holds a set of drivers',
            best: true,
            why: 'An update is at most a move between two sets, so it stays cheap at any rate. A nearby query reads the pickup cell plus a ring around it (7 H3 cells for one ring, 19 for two) and filters by exact distance. Cells are roughly equal in area across the globe and nest into coarser cells (exactly for S2, approximately for H3), which sharding also uses.',
          },
          {
            label: 'Geohash in Redis (GEOADD and GEOSEARCH)',
            why: 'Defensible too, and the fastest to build: the same idea off the shelf, a sorted set scored by a 52-bit geohash. Cells are defined in degrees, so their shape and size change with latitude, and neighbors across a prefix boundary need separate range reads, which Redis does for you but a hand-built geohash index must remember.',
          },
          {
            label: 'A quadtree that splits busy areas into smaller cells',
            why: 'It adapts to density, which suits points that rarely move, such as restaurants. Here every driver moves every few seconds, so the tree splits and merges constantly and needs locking under concurrent writes.',
          },
          {
            label: 'A spatial index in the database (PostGIS with a GiST index)',
            why: 'Correct queries, but every update becomes a durable, logged index write: 250,000 of them a second, for data that is stale in 4 seconds. Keep the database for trips.',
          },
        ],
      },
      estimate: {
        question: 'Memory for the live index of every online driver',
        answer: 200,
        unit: 'MB',
        working: [
          'Per driver: ID, position, cell, heading, speed, status, vehicle type and a timestamp come to about 50 bytes, about 200 with map and set overhead.',
          '1 million drivers times 200 bytes is 200 MB.',
        ],
      },
      points: [
        "The whole world fits in one machine's memory. You shard the index for the write rate and to keep a failure local, not for its size.",
        'H3 resolution 8 hexagons average about 0.74 km², a good matching cell in a city. Hexagons have one kind of neighbor, all six at the same distance, which makes rings simple. Geohash precision 6 cells are about 1.2 by 0.6 km at the equator.',
        'Each entry carries its last update time; drivers silent for more than about 15 seconds are skipped by queries and then dropped, so a phone that loses signal stops receiving offers.',
        'No write-ahead log and no replica: each update carries the status and current trip ID of its driver, so if an index node dies a new one is fully rebuilt from the next 4 seconds of updates, busy drivers included. The durable truth is the trip database and the location log.',
        'Keep available drivers apart from busy ones (separate sets per cell, or a status filter), since dispatch only wants the available ones and the rider map only shows them.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Match and dispatch',
      prompt:
        'Three drivers are near a rider. Who gets the offer, what happens if they ignore it, and how do you make sure no driver ends up with two trips at once?',
      decision: {
        question: 'How do you offer a trip to drivers?',
        options: [
          {
            label:
              'To one driver at a time: reserve the driver atomically, wait 10 to 15 seconds, and move to the next on a decline or timeout',
            best: true,
            why: 'The reservation guarantees no driver holds two offers, only one driver ever sees each trip at a time, and a decline costs one timeout. The price is a slower match when several drivers in a row decline.',
          },
          {
            label: 'To the five nearest at once; the first to accept wins',
            why: 'Defensible where drivers often decline, since the first acceptance comes sooner. Four drivers per trip tap accept for nothing, the best-placed driver often loses to a faster thumb, and you still need an atomic check so the trip goes to only one.',
          },
          {
            label: 'Assign the nearest driver with no chance to decline',
            why: 'Fastest, and right for a fleet of employed drivers, but independent drivers can refuse work, and one who is refueling or ending a shift will simply cancel later, which is worse for the rider.',
          },
          {
            label: 'Send the offer to the best driver without reserving anyone',
            why: 'Two ride requests near the same driver both pick them, and the driver gets two offers, or accepts one trip while the other waits on an answer that never comes.',
          },
        ],
      },
      points: [
        'Candidates: available drivers of the right product in the pickup cell and its rings, fresh within 15 seconds. Pre-rank by straight-line distance, then ask the ETA service to rank the top 10 or so by road time, since a river or a one-way street makes the nearest car the wrong one.',
        'Reserve with an atomic compare-and-set on the driver: available to offered, carrying the trip and offer ID and an expiry, for example a Redis `SET` with `NX` and an expiry. Only one request can win it.',
        'Accept is a second compare-and-set, on the trip: requested to accepted, with this driver, only if the offer ID matches. A late accept after the timeout finds the offer gone and is refused; a retried accept with the same offer ID gets the same answer.',
        'Backstop in the trip database: a partial unique index on driver ID over open states (accepted, arrived, in progress), so even a lost reservation cannot give one driver two trips.',
        'On a decline or timeout, release the driver and offer to the next candidate. After a few tries widen the ring; after a minute or two, tell the rider no car is available.',
        'Greedy one-at-a-time matching is not globally best: holding requests for a second or two and solving the assignment of requests to drivers as a batch cuts total pickup time in busy areas. Mention it once greedy works.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Model the trip',
      prompt:
        'The rider cancels at the moment the driver accepts; the network drops a driver\'s "trip ended". How do you keep a trip consistent?',
      points: [
        'An explicit state machine: requested, then accepted (driver en route), arrived, in progress, completed. Cancelled is reachable from requested, accepted and arrived; no driver found ends a request that dispatch gives up on.',
        'Every transition is a conditional write: set the new state only if the current state (or a version number) is the expected one. The race between cancel and accept has exactly one winner, and the loser gets a clear error.',
        'Trips live in a transactional database keyed by trip ID, with the driver and rider as indexed columns. The rate is only hundreds of transitions a second, so correctness costs little here.',
        "The driver's status in the index follows the trip: offered, then on trip, and available again when the trip completes or is cancelled. A periodic job repairs any driver stuck as busy with no open trip.",
        'Each transition publishes an event to the log. Receipts, payments, rider notifications and analytics consume it, so the trip service stays small.',
        'Every client call is idempotent by trip ID and expected state, so a retried "trip ended" after a dropped connection simply confirms the state it already reached.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Shard by geography',
      prompt:
        'A single process cannot take 250,000 updates a second, and a failure in Paris should not stop dispatch in Tokyo. How do you split the location and dispatch state?',
      decision: {
        question: 'What do you shard the geo index and dispatch by?',
        options: [
          {
            label:
              'By region: coarse cells (a city, or part of a big one) assigned to nodes, with each driver and trip handled by the node owning its cell',
            best: true,
            why: 'Matching is local, so almost every query and every offer stays on one node, and a failure affects one region. Coarse cells let you split a large city across several nodes and move cells to rebalance.',
          },
          {
            label: 'One shard per city',
            why: 'Defensible to start, and it matches how the business runs, but the biggest cities are far busier than the rest, so their shards run hot, and a pickup near a city boundary or an airport between cities needs drivers from both.',
          },
          {
            label: 'By a hash of the driver ID',
            why: 'Spreads writes perfectly evenly, but nearby drivers land on every shard, so each nearby query and each dispatch must ask all of them and merge the answers.',
          },
        ],
      },
      points: [
        'A shard map says which node owns which coarse cells; gateways and services route by the pickup or driver cell. An explicit map managed by a coordinator (for example in etcd or ZooKeeper) places busy cells on their own nodes and moves them deliberately; consistent hashing would ignore how uneven cities are and scatter neighboring cells.',
        'A query near a shard border reads the ring cells owned by the neighbor too: a small scatter to one or two extra nodes, not to all of them.',
        'A driver crossing into a cell owned by another node is removed from the old one and added to the new one on the next update; the entry is small, so a handoff is cheap.',
        "The shard that owns a trip's pickup cell dispatches it, but a driver near a border can be a candidate for two shards, so the reservation is always made on the node that owns the driver's current cell (or in one store keyed by driver ID), and exactly one dispatcher wins it.",
        'On node failure, its cells move to another node, whose index fills from the next round of updates within seconds. Open offers expire on their own, and the trip database says which trips still need a driver.',
      ],
    },
    {
      kind: 'data',
      title: 'Store trips and history',
      prompt:
        'Receipts, fare disputes, safety investigations and ETA models all want the path each car drove. How much is that, and where does it go?',
      estimate: {
        question: 'Location history written per day',
        answer: 540,
        unit: 'GB',
        working: [
          'Across the day, about half the peak is online: 500,000 drivers at one point every 4 seconds is 125,000 points a second.',
          'Per day: 125,000 times 86,400 is 10.8 billion points.',
          'At about 50 bytes a point (driver and trip IDs, position, time, speed, heading, accuracy): 10.8 billion times 50 bytes is 540 GB a day, about 200 TB a year before replication.',
        ],
      },
      points: [
        'Points flow from the location log into batched writes: a wide-column store keyed by trip ID and time for recent trips, and compressed files in object storage for the long tail and for analytics.',
        'No database takes the raw points one by one: the log absorbs the rate, and consumers write large batches.',
        'The fare uses the trip trace after the trip ends, cleaned of GPS jumps by snapping it to roads, so a few dropped updates change nothing.',
        'Trips: 20 million rows a day, each a few hundred bytes to a few KB with its events. A relational database sharded by trip ID (or region) handles that, with a per-rider and per-driver index for history screens.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'You have five minutes left. What would you raise before the interviewer does?',
      points: [
        "Multi-region: a region's cities are served from the nearest data center; a data center failure moves those cities to another, and the live index rebuilds from incoming updates, while trips rely on the replicated trip database.",
        'Fraud and safety: spoofed GPS (a phone reporting a false position to catch more rides or inflate fares) shows up as impossible speeds and jumps; trips with long unexpected stops alert safety teams.',
        'Surge pricing reads the same cells: open requests against available drivers per cell over the last few minutes.',
        'Monitoring: time to match, offer acceptance rate, age of the positions dispatch reads, gateway connections, and log consumer lag.',
      ],
    },
  ],
  pitfalls: [
    'Writing every location update to a relational database with a spatial index, so the firehose of short-lived positions drives the database design.',
    'Picking the nearest driver by straight-line distance and ignoring roads, rivers and one-way streets.',
    'Offering a trip without an atomic reservation on the driver, so one driver can receive two offers, or a trip can be accepted by two drivers.',
    'Leaving the trip without an explicit state machine, so a cancel racing an accept, or a retried "trip ended", leaves the trip and the driver in contradictory states.',
    'Sharding driver positions by driver ID, which turns every nearby query into a scatter across all shards.',
  ],
  followUps: [
    {
      question: 'A dispatch node dies in the middle of the evening peak. What happens?',
      answer:
        "Its cells move to another node from the shard map. Drivers keep sending updates every 4 seconds, so within a few seconds the new owner's index is full again. Offers in flight had expiries, so the drivers become available when they lapse, and trips still marked requested in the trip database are dispatched again. Riders see a few seconds' delay, not a failure.",
    },
    {
      question: 'How would you add pooled rides, where several riders share one car?',
      answer:
        'A driver is no longer simply available or busy: a car on a trip with a free seat is a candidate if the detour for the riders on board stays within a limit. Matching becomes a search over routes with insertion of a new pickup and drop-off, usually done in short batches, and the trip model splits into a vehicle route with several rider trips attached.',
    },
    {
      question: 'Drivers in an underground garage send no updates for a minute. What do riders and dispatch see?',
      answer:
        'After about 15 seconds without updates the driver is skipped by queries and gets no offers. A driver already on a trip stays assigned; the rider map shows the last position and the app estimates movement along the route until updates resume, when the trace fills from points the phone buffered.',
    },
  ],
};
