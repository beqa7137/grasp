import type { CaseStudy } from './types.js';

export const CHAT: CaseStudy = {
  id: 'chat',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt:
        'Chat looks simple until you ask what "delivered" means. Which questions pin down the problem, and which features do you park?',
      decision: {
        question: 'The interviewer asks whether messages are end-to-end encrypted. What do you answer?',
        options: [
          {
            label:
              'Treat it as in scope for the design, but leave the cryptography out: the server only relays and stores opaque ciphertext',
            best: true,
            why: "It changes what the server can do (no server-side search, previews or content moderation, and each of a user's devices needs its own copy), so it belongs in the requirements. The protocol itself (the Signal protocol: X3DH key agreement (PQXDH in Signal today), the Double Ratchet, Sender Keys for groups) is a separate interview.",
          },
          {
            label: 'Design the key exchange and ratchet in detail',
            why: 'Interesting, but it spends the interview on cryptography and leaves no time for connections, ordering and delivery, which is what this question tests.',
          },
          {
            label: 'TLS to the server is enough; the server can read messages',
            why: 'Defensible too for a workplace chat that needs server-side search, retention and compliance export. Say it is a product decision with real trade-offs, not a default, and confirm which product you are building.',
          },
          {
            label: 'Skip it: security is out of scope',
            why: 'Encryption changes the data flow and what the server may store, so waving it away misses a requirement that shapes storage, search and multi-device sync.',
          },
        ],
      },
      points: [
        "Functional: one-to-one chats and small groups (up to 100 members, from the interviewer), text messages, message history synced across a user's devices.",
        'Receipts: sent (the server has it durably), delivered (a recipient device has it) and read. Messages appear in the same order for every member of a conversation.',
        'Offline delivery: a message sent to someone offline is never lost; it arrives when they reconnect, and a push notification tells them it is waiting.',
        'Presence: online now, or last seen. It may be a few seconds stale.',
        'Scale (from the interviewer): 500 million daily users sending about 40 messages each a day. Delivery to an online recipient should take well under a second.',
        'Out of scope unless asked: voice and video calls, stories, message search. Media is a link to object storage, not part of the message path.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the traffic',
      prompt: '500 million daily users send 40 messages each a day. How many messages per second is that on average?',
      estimate: {
        question: 'Average messages sent per second',
        answer: 231_481,
        unit: 'messages/s',
        working: [
          'Messages per day: 500 million times 40 is 20 billion.',
          'Per second: 20 billion / 100,000 (rounding the day up) is about 200,000.',
          'Exactly: 20,000,000,000 / 86,400 is about 231,000 messages per second.',
          'Peaks run about twice the average: plan for about 460,000 messages per second.',
        ],
      },
      points: [
        'About 230k messages/s on average and roughly 460k at peak. Group messages multiply deliveries, not stored messages.',
        'Unlike a feed, the store is write-heavy: each message is written once and mostly delivered straight from the write path to a connected device, so few are ever read back from storage.',
        'The per-message work is small; the hard parts are holding connections open and finding the right one fast.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the connections',
      prompt:
        'At the daily peak, 30% of the 500 million users are online at once, each holding one open connection. If a gateway server holds 100,000 connections, how many gateways do you need?',
      estimate: {
        question: 'Gateway servers for peak concurrent connections',
        answer: 1_500,
        unit: 'servers',
        working: [
          'Concurrent connections: 30% of 500 million is 150 million.',
          'Per gateway: 150 million / 100,000 is 1,500 servers.',
          'Add headroom for a failed zone and rolling deploys: run about 2,000.',
        ],
      },
      points: [
        'Tuned servers can hold a million or more idle connections; 100,000 is a conservative figure that keeps memory (TLS state and socket buffers) and the reconnect storm after one server dies manageable.',
        'Most connections are idle: the cost is memory and heartbeats, not CPU.',
        'A session registry entry per connection (user, device, gateway, about 100 bytes) is 150 million times 100 bytes, about 15 GB: a small in-memory cluster.',
      ],
    },
    {
      kind: 'api',
      title: 'Choose the connection',
      prompt: 'The server must push a message to a recipient the moment it arrives. How does the client stay reachable?',
      decision: {
        question: 'Which transport would you use between the app and the servers?',
        options: [
          {
            label: 'WebSockets: one long-lived, full-duplex connection per device',
            best: true,
            why: 'Either side can send at any time over one TCP and TLS connection, with a few bytes of framing per message. Sends, acks, receipts, typing and presence all share it.',
          },
          {
            label: 'Long polling: the client holds a request open until there is something to return',
            why: 'Works through any proxy, so it is a good fallback, but every delivery ends the request and the client must reconnect, which adds latency and connection churn at 230k messages/s.',
          },
          {
            label: 'Server-sent events for delivery, plain HTTP requests for sending',
            why: 'Defensible too: it rides standard HTTP infrastructure, and over HTTP/2 the extra requests are cheap. It splits one conversation over two channels, though, and SSE carries only UTF-8 text, so binary frames need base64.',
          },
          {
            label: 'Short polling every few seconds',
            why: 'Latency equals the poll interval, and 150 million clients polling every 2 seconds is 75 million requests a second, almost all of them empty.',
          },
        ],
      },
      points: [
        'On the socket, a send carries a client-generated `client_msg_id`; the server acks it with the conversation sequence number once the message is durable (the "sent" tick).',
        'Heartbeats every 30 seconds or so keep NAT and load balancer mappings alive and detect dead connections on both sides.',
        'History and the conversation list use ordinary HTTP: `GET /conversations`, and `GET /messages` for one conversation after a given seq.',
        "Mobile operating systems suspend a backgrounded app's socket, so the socket is for the foreground; push notifications (APNs, FCM) cover the rest.",
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt:
        "Alice sends a message to Bob. Their sockets are held by different gateway servers. Trace the message from Alice's phone to Bob's.",
      lab: true,
      points: [
        'Gateways are thin and stateful: they terminate the socket, authenticate once on connect and pass messages to a stateless chat service. A layer 4 load balancer spreads new connections; an open one stays on its gateway.',
        'On connect, the gateway writes `user, device -> gateway` to a session registry (an in-memory store such as Redis) with a TTL it refreshes; on disconnect it deletes the entry.',
        'The chat service assigns the conversation sequence number, appends the message to a durable log partitioned by conversation ID (for example Kafka), and acks Alice: the message is now safe.',
        "Consumers write it to the message store and route it: look up each recipient device in the registry and forward it to that gateway, which writes it to Bob's socket. No live session means offline, so a push job is queued.",
        'Open the build in the Lab: 20,000 requests a second, half of them sends and half history reads, one slice of the 230k average. The simulator has no persistent connections: the app tier stands for the gateways plus the chat service, the cache for the session registry and recent messages, the queue for the log and the workers for persistence and delivery. Push it to 30,000 and see what runs hot first.',
      ],
    },
    {
      kind: 'data',
      title: 'Store the messages',
      prompt:
        'Every message is written once and read mostly as "the latest page of this conversation". Where do they live, and how big does that get?',
      estimate: {
        question: 'Message storage per year, before replication',
        answer: 730,
        unit: 'TB',
        working: [
          'Assume about 100 bytes per message: short text plus IDs and timestamps. Media is stored elsewhere as a link. That is lean: encryption and storage overhead can double it.',
          'Per day: 20 billion times 100 bytes is 2 TB.',
          'Per year: 2 TB times 365 is 730 TB, about 2.2 PB with three replicas.',
        ],
      },
      decision: {
        question: 'Which store fits the message history?',
        options: [
          {
            label: 'A wide-column store (Cassandra, ScyllaDB, HBase) partitioned by conversation ID, sorted by sequence',
            best: true,
            why: 'Built for a high, steady rate of appends spread over many nodes, and the hot query (the latest 50 messages of a conversation) is one sequential read inside one partition.',
          },
          {
            label: 'A relational database sharded by conversation ID',
            why: 'Defensible too: the query is just as simple, and teams that run sharded MySQL or Postgres at scale do this. You own shard routing and resharding yourself at 230k inserts a second and 730 TB a year.',
          },
          {
            label: 'A document store with one document per conversation holding its messages',
            why: 'The document grows without limit, every send rewrites a large document, and busy groups hit the document size cap.',
          },
          {
            label: 'One relational primary with read replicas',
            why: 'Replicas add read capacity, not write capacity, and this workload is almost all writes. One primary cannot take 230k inserts a second or hold 730 TB.',
          },
        ],
      },
      points: [
        'Messages table: partition key `conversation_id`, clustering key `seq` descending, then sender, `client_msg_id`, body (ciphertext if end-to-end encrypted) and created time.',
        "Bucket long-lived conversations by time, for example `(conversation_id, month)`, so a busy group's partition stays bounded.",
        "Per user, a conversation list sorted by last activity, with each member's delivered and read watermarks and unread count.",
        'If the product only relays encrypted messages and keeps history on devices, the server deletes each message once every recipient device has it, and 730 TB shrinks to the undelivered backlog. Ask which product this is. Undelivered messages still need a retention cap, such as 30 days, and history no longer syncs to a new device.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Order the messages',
      prompt:
        'Two members of a group send at the same moment. Everyone must see the same order, and a retried send must not appear twice. How?',
      decision: {
        question: 'What decides the order of messages in a conversation?',
        options: [
          {
            label: 'A sequence number per conversation, assigned by the server',
            best: true,
            why: 'Every member sorts by the same number, gaps are cheap to detect ("I have 41, the server says 45, fetch 42 to 44"), and sync becomes "give me everything after my last seq".',
          },
          {
            label: 'Time-sortable IDs (Snowflake style) minted by any server',
            why: 'Defensible too: unique, roughly time ordered and no coordination. Clock skew between servers can swap two messages sent a few milliseconds apart, and gap detection is lost. Many systems accept that.',
          },
          {
            label: "The sender device's timestamp",
            why: 'Phone clocks are wrong by seconds or minutes, and a user can set them freely, so replies can appear before the message they answer.',
          },
          {
            label: 'One global sequence for every message',
            why: 'Order only matters within a conversation. A single global counter at 460k increments a second is a bottleneck and a single point of failure for nothing.',
          },
        ],
      },
      points: [
        'Assign `seq` with an atomic increment on a counter keyed by conversation (Redis `INCR`, or a conditional write in the store). After a counter failover, restart it above the last seq in the log, not the store, or two messages share a seq.',
        'The client makes up `client_msg_id` (a UUID) and retries with the same one; the server keeps it per conversation and returns the original `seq` for a duplicate. At-least-once delivery plus deduplication gives exactly-once display.',
        'Messages from one sender go out in order on one socket; the client shows a pending message at the bottom and moves it into place when its `seq` arrives.',
        "A message's unique ID is simply `(conversation_id, seq)`.",
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Deliver to offline users',
      prompt:
        "Bob's phone is in a tunnel for an hour. Nothing may be lost, and his phone should buzz. How does he catch up, and how does Alice get her ticks?",
      points: [
        'The message is already durable before routing, so an offline recipient loses nothing: routing finds no session in the registry and queues a push job instead.',
        'Push workers call APNs or FCM, collapsing a burst into one notification. With end-to-end encryption the payload is encrypted or just says "new message", and the app fetches the rest.',
        'Push is best effort: sync on reconnect is the real delivery. Each device keeps its last `seq` per conversation, asks for conversations changed since its last sync, then fetches messages after its seq.',
        'Receipts are watermarks, not rows: each member has one "delivered up to seq" and one "read up to seq" per conversation, updated when the device acks and sent to the sender as a small event.',
        "A group message shows delivered or read when every member's watermark passes it, so store watermarks per member and compute the tick, never one row per message per recipient.",
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Groups and presence at scale',
      prompt:
        'A 100-member group gets a message, and every user wants to see which friends are online. Where does the work multiply, and how do you keep it bounded?',
      points: [
        "Store once, deliver many: the message is written once to the group's partition, then routed to each member's devices. Batch the registry lookup (one multi-get) and send one call per gateway with its list of recipients.",
        "The group size cap bounds fan-out: 100 members with about 2 devices each is at most 200 deliveries per message. Updating each member's conversation list and unread count is the same fan-out, done asynchronously by workers.",
        'With end-to-end encryption, Sender Keys let a sender encrypt a group message once instead of once per member device.',
        'Presence is the hidden load: 150 million connections heartbeating every 30 seconds is 5 million beats a second. Keep beats on the gateway, and write to the presence store only on a real transition, after a grace period so a tunnel does not flap someone offline.',
        'Push presence only to people who are looking: a client subscribes to the contacts on its screen and the chat that is open, and unsubscribes when they scroll away. Large groups show no per-member presence; "last seen" is written on disconnect.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'You have five minutes left. What would you raise before the interviewer does?',
      points: [
        'Multi-region: users connect to the nearest region; each conversation has a home region that assigns its sequence, and gateways forward cross-region sends and deliveries there.',
        'Media: the client uploads to object storage with a pre-signed URL (encrypted on the device if end-to-end) and sends only the link and key in the message.',
        'Abuse: rate limit sends per user and per new account, and let users report, since the server cannot read encrypted content.',
        'Monitoring: end-to-end delivery latency p99, connections and reconnects per gateway, log consumer lag, and push delivery failures.',
      ],
    },
  ],
  pitfalls: [
    "Designing a stateless request and response API and never explaining how a message finds the one server holding the recipient's connection.",
    "Ordering messages by the sender's clock, or by a single global counter.",
    'Treating push notifications as guaranteed delivery, or acking the sender before the message is durable.',
    'Broadcasting every presence change to every contact, so presence traffic dwarfs the messages themselves.',
  ],
  followUps: [
    {
      question: 'A gateway holding 100,000 connections crashes. What happens?',
      answer:
        'Clients see the socket drop or miss heartbeats and reconnect through the load balancer with jittered exponential backoff, so they do not all land at once. Stale registry entries expire by TTL; a delivery to one fails and falls back to push. On reconnect each device syncs from its last seq, so nothing is lost.',
    },
    {
      question: 'How do you support several devices per user?',
      answer:
        "The registry and the sync cursor are per device, and delivery goes to every device of each recipient, including the sender's other devices. With end-to-end encryption the sender encrypts for each device, and a new device sees old history only through a backup or a transfer from an existing device.",
    },
    {
      question: 'The product now wants groups of 100,000 members. What changes?',
      answer:
        'Per-member fan-out and per-member receipts stop scaling. Treat it like a channel: members pull from the conversation log when they open it, push notifications are sampled or digested, read receipts become counts, and presence is dropped.',
    },
  ],
};
