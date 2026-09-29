import type { SdLesson } from './types.js';

export const REALTIME_LESSON: SdLesson = {
  why: 'Chat, live scores, notifications, dashboards and collaborative editors all need the server to tell the client something the moment it happens, and HTTP was built for the client to ask. The choice between polling, long polling, server-sent events and WebSockets decides how many requests your servers answer for nothing, how many connections they must hold open, and how stale the screen is. Interviewers then push past the protocol: how a message finds the one server among hundreds that holds the recipient, what happens when a million clients reconnect at once, and how a phone that dropped off the network gets the messages it missed.',
  widget: {
    kind: 'delivery',
    tryThis: [
      'Keep the defaults: Polling every 5 s with 1 million clients and 1 event per client per minute. The servers answer 200,000 requests per second, an event waits 2.6 s on average (half the 5 s interval plus half a 100 ms round trip), 20,000 requests are in flight at any moment, and headers alone cost 160 MB/s. Each client asks 12 times a minute for 1 event, so at least 11 of every 12 answers are empty. Slide the interval to 1 s: 1,000,000 requests per second, 550 ms of delay and 800 MB/s of headers. Slide it to 60 s: about 16,667 requests per second and 13.3 MB/s, but events now wait about 30 s.',
      'Switch to Long polling: 50,000 requests per second (one per event plus one per 30 s timeout), 50 ms of delay, 40 MB/s of headers, and 1,000,000 open connections, because every client now has a request parked on the server. Slide the events to 0: still about 33,333 requests per second and 26.7 MB/s, just from timeouts. Slide them to 60: about 1,033,333 requests per second and 826.7 MB/s, more than polling every second, since every event costs a full request and response. Long polling suits rare events; a busy stream needs a connection that stays open.',
      'Switch to Server-sent events, then WebSocket: 0 requests per second, 50 ms of delay and 0 MB/s of headers, at any event rate, with 1,000,000 open connections. The model treats the two alike because both push over one open connection with no per-message HTTP headers (a WebSocket frame adds 2 to 14 bytes). Set 10 million clients: 10,000,000 open connections, which is now the whole cost. At an assumed 20 KB per connection (not modeled) that is about 200 GB of memory across the gateway tier. Compare Polling every 5 s at 10 million clients: 2,000,000 requests per second and 1,600 MB/s of headers.',
    ],
  },
  concepts: [
    {
      title: 'Short polling and long polling',
      body: 'Short polling asks on a timer, such as `GET /updates?since=812` every 5 s. It is plain HTTP, so it works through every proxy and cache and is trivial to scale statelessly, but delay averages half the interval and most answers are empty, each paying for headers, TLS record overhead and a trip through the load balancer, auth and routing. Long polling sends the same request and the server holds it until an event arrives or a timeout, around 20 to 30 s, kept below proxy idle timeouts; the client then asks again at once. Delay drops to a fraction of a round trip, but every event costs a full request, and events that arrive between a response and the next request must be buffered on the server and fetched by cursor, or they are lost. Polling is the right answer when events are rare, freshness of tens of seconds is fine, or the same content goes to everyone and can be cached at a CDN.',
    },
    {
      title: 'Server-sent events and WebSockets',
      body: 'Server-sent events (SSE) are one long HTTP response with type `text/event-stream`: the server writes `data:` lines as events happen, server to client only, UTF-8 text only. The browser `EventSource` API reconnects on its own, honours a `retry:` hint, and sends the last `id:` it saw in a `Last-Event-ID` header so the server can resume. Client-to-server messages go as ordinary requests. A WebSocket starts as an HTTP/1.1 request with `Upgrade: websocket`, gets `101 Switching Protocols`, and becomes a full-duplex stream of text or binary frames with a 2 to 14 byte header each. It has no built-in reconnect, resume or message ids: the application builds them. Choose SSE for server-to-client feeds (scores, notifications, streamed AI output) because it is plain HTTP; choose WebSockets for chatty two-way traffic (chat with typing indicators, games, collaborative editing) or binary payloads.',
    },
    {
      title: 'Proxies, HTTP/2 and HTTP/3',
      body: 'Long-lived connections meet middleboxes built for short requests. Load balancers and proxies close idle connections (nginx `proxy_read_timeout` and the AWS ALB idle timeout both default to 60 s), so send a heartbeat every 20 to 30 s. Nginx needs `proxy_http_version 1.1` and the Upgrade and Connection headers forwarded before WebSockets pass through, and response buffering in a proxy can hold SSE events back until it is disabled. Over HTTP/1.1 a browser opens about 6 connections per host, so SSE in several tabs can starve the page; HTTP/2 multiplexes many streams over one connection, which removes that limit for SSE. WebSockets over HTTP/2 (RFC 8441) and HTTP/3 (RFC 9220) exist, but support in servers and proxies is uneven, so most deployments still upgrade an HTTP/1.1 connection. HTTP/3 runs over QUIC, whose connection migration lets a phone keep a connection when it moves from Wi-Fi to cellular.',
    },
    {
      title: 'Holding millions of open connections',
      body: 'An idle connection costs little CPU but real memory and a file descriptor. Budget roughly 10 to 50 KB per connection for kernel socket buffers, TLS state and the application session, so 1 million connections take tens of GB. Raise the descriptor limits (`ulimit -n`, `fs.nr_open`) far above the default soft limit of 1,024. A thread per connection cannot scale to that, since each thread reserves its own stack; gateways use an event loop over epoll or kqueue (Netty, Go, Node.js, Erlang) so a few threads serve every socket. One well-tuned box can hold hundreds of thousands to a few million connections (WhatsApp reported over 2 million per server in 2012), but plan for fewer: a box that dies drops all of them at once, and they all reconnect somewhere else. A proxy or load balancer that opens its own connection to each backend is limited to about 64,000 source ports per backend address, so spread it across several backend IPs or ports.',
    },
    {
      title: 'Gateways and a pub/sub backbone',
      body: 'Split the system in two. A thin gateway tier only holds connections: it authenticates the client, records user to gateway in a connection registry (Redis with a TTL), forwards what the client sends to backend services, and writes to the socket what the backend sends back. Business logic lives behind it and can deploy without dropping connections. To deliver an event, the backend looks up which gateway holds each recipient and publishes to that gateway, for example on a Redis pub/sub channel per gateway, or each gateway subscribes to a channel per connected user. Redis pub/sub is fire and forget: a subscriber that is down misses the message, so the durable copy must live elsewhere. Kafka is durable and replayable and makes a good backbone for the event stream, but it is partitioned by key, not by recipient connection, so a delivery service consumes it and routes each event to the right gateway. A user with a phone and two browser tabs has three connections, possibly on three gateways; deliver to all of them.',
    },
    {
      title: 'Presence and heartbeats',
      body: 'A TCP connection can die silently: a phone loses signal and no FIN ever arrives, so the server holds a dead socket for minutes. Heartbeats find it: the client or server pings every 20 to 30 s (WebSocket ping and pong frames, or a comment line in SSE), and the gateway closes a connection that misses two or three. Presence (online, last seen) follows from this: each heartbeat refreshes a key with a TTL of a few intervals, and the user is offline when it expires. Heartbeats are traffic too: 10 million clients pinging every 30 s send about 333,000 frames per second. Broadcasting every presence change to every friend is the expensive part, so debounce flapping connections, send presence only for chats on screen, and fetch the rest lazily.',
    },
    {
      title: 'Ordering, missed messages and resume',
      body: "Push is not delivery: a message written to a socket just before the connection died is lost, and after a reconnect the client has a gap. Store every message durably first, give it a sequence number per conversation from a single writer (the conversation's partition leader or a counter row), and push it only after that. The client remembers the last sequence number it applied; on reconnect it sends it (`Last-Event-ID` in SSE, a resume message on a WebSocket) and the server replays everything after it from the store. A jump in sequence numbers shows a gap to fill, and a unique message id lets the client drop duplicates, so delivery is at least once and display is exactly once. Order holds within a conversation; across conversations it rarely matters and would need a global sequencer.",
    },
    {
      title: 'Reconnect storms and mobile push',
      body: 'When a gateway restarts or a region blips, every client it held reconnects at the same moment, and each reconnect is a TLS handshake, an auth check, a registry write and a resume query. Clients must back off exponentially with full jitter, waiting a random time between 0 and `min(cap, base * 2^n)`, so retries spread out instead of arriving in waves. Deploys should drain gateways gradually, closing a few percent of connections at a time or telling clients to reconnect after a random delay. Apps in the background are another case: iOS suspends them and Android restricts them, so their sockets close. Reach them through Apple Push Notification service (APNs) and Firebase Cloud Messaging (FCM): payloads are capped at about 4 KB, delivery is best effort and may be delayed or coalesced, and APNs keeps only the latest notification per app for a device that is offline. Treat a push as a hint that wakes the app to fetch from its last sequence number, and keep message content out of it where privacy matters.',
    },
  ],
  examples: [
    {
      title: 'Live scores for 10 million fans',
      problem:
        'A sports app expects 10 million concurrent users during a final. A score or event changes about once a minute, and the product wants updates on screen within 5 s. The current design polls `GET /match/77` every 5 s with about 800 bytes of headers per request. Estimate the load and propose a design.',
      insight: 'When everyone needs the same update, polling a CDN-cached URL can beat holding 10 million connections.',
      steps: [
        'Polling the origin: 10 million clients every 5 s is 2 million requests per second and 1.6 GB/s of headers, for about one real change a minute. Average delay is about 2.5 s, which meets the target, but 11 of every 12 answers are unchanged.',
        'SSE through a gateway tier: 10 million open connections at an assumed 20 KB each is about 200 GB of memory. At 500,000 connections per gateway that is 20 gateways, 30 with headroom to lose a zone. A goal becomes 10 million pushes of about 200 bytes, 2 GB in total, or 500,000 writes per gateway, sent within a second or two.',
        'Polling a CDN: the response is identical for every fan, so cache it with `Cache-Control: max-age=2`. The 2 million requests per second are answered at the edge; the origin sees about one request per edge location every 2 s, a few hundred per second. Worst-case delay is the TTL plus the poll interval, about 7 s, 3.5 s on average.',
        'Pick by requirement: the CDN version meets a 5 s average target at a fraction of the cost and needs no connection tier. If the product wants sub-second updates or per-user data (a fantasy team score), use SSE, which is one-way and plain HTTP, and keep polling as the fallback when a connection fails.',
      ],
    },
    {
      title: 'Routing chat messages across 40 gateways',
      problem:
        'A chat app has 50 million daily users and 10 million connected at peak, each sending about 40 messages a day. Gateways hold 250,000 WebSocket connections each, and clients heartbeat every 30 s. Size the gateway tier and describe how a message from Ana reaches Ben, including when Ben is offline.',
      insight:
        'Gateways only hold sockets; a registry says where each user is, the store makes the message durable, and heartbeats outnumber messages.',
      steps: [
        'Gateways: 10 million connections over 250,000 each is 40 gateways; add about a quarter for failures and deploys, 50. Registry: 10 million entries of user to gateway at about 100 bytes each is 1 GB in Redis, refreshed by heartbeats.',
        'Messages: 50 million times 40 is 2 billion a day, about 23,000 per second on average and roughly 70,000 at a 3x peak. Heartbeats: 10 million every 30 s is about 333,000 per second, five times the peak message rate, so they must be tiny frames answered in the gateway without touching the backend.',
        "Send path: Ana's gateway forwards the message to the chat service, which appends it to the conversation with the next sequence number (say 5,012), acknowledges Ana with that number, then looks up Ben in the registry and publishes to the channel of each gateway holding one of his connections. That gateway writes it to his socket.",
        'Ben offline: the registry has no entry, so the chat service sends an APNs or FCM push with the conversation id and no message text. The app wakes or Ben opens it, connects, and sends his last applied sequence number, 5,008; the server replays 5,009 to 5,012 from the store. A message lost in Redis pub/sub, which does not retry, is recovered the same way on the next gap or reconnect.',
        'Group chats: a message to a group of 200 is one stored message and up to 200 registry lookups and publishes. For groups of many thousands, have gateways subscribe to the group channel instead of fanning out per member.',
      ],
    },
    {
      title: 'A deploy that took the chat down',
      problem:
        'A chat backend holds 2 million WebSocket connections on 10 gateways, 200,000 each. The gateway tier can accept about 20,000 new connections per second in total, limited by TLS handshakes, auth and resume queries. Clients reconnect immediately after a drop, and retry after a 5 s timeout. A rolling deploy restarts one gateway at a time, and the whole tier went down. Explain and fix it.',
      insight: 'Reconnects must be spread in time on both sides: jitter in the client, gradual drains on the server.',
      steps: [
        'One restart drops 200,000 clients, who all reconnect within about a second: ten times the 20,000 per second the tier can accept. Handshakes queue, many take longer than 5 s, the clients give up and retry, and the retries add to the queue that is already full.',
        'The spill reaches every gateway: the overloaded ones slow down, miss heartbeats and get marked unhealthy, which drops their connections too. Now all 2 million clients are reconnecting, and each also asks the message store for everything since its last sequence number.',
        'Client fix: wait a random 0 to 30 s before the first reconnect, then back off exponentially with full jitter, doubling the window after each failure up to a cap near 2 minutes. 200,000 reconnects spread over a 30 s window arrive at about 6,700 per second, a third of capacity. Even after a full outage, 2 million clients need at least 100 s at 20,000 per second, so the cap must stretch that far.',
        'Server fix: drain instead of killing. Mark the gateway as draining so the load balancer sends it no new connections, then close its 200,000 connections over 10 minutes, about 333 per second, or send each client a reconnect message with a random delay. Stop the deploy automatically if reconnect errors rise.',
        'Protect the backend too: rate-limit new connections per gateway and return a retry-after instead of accepting more than it can serve, and serve resume queries from a cache of recent messages per conversation so a storm does not become a database outage.',
      ],
    },
  ],
  pitfalls: [
    'Treating a push as delivered: messages written to a socket that is dying are lost. Store first, number per conversation, and let the client resume from its last sequence number on every reconnect.',
    'Reconnecting immediately or on a fixed delay: every client that dropped together retries together, and the storm keeps the servers down. Use exponential backoff with full jitter and drain gateways gradually on deploys.',
    'Forgetting idle timeouts: a proxy or load balancer silently closes connections that stay quiet for 60 s, and the client sees random drops. Send heartbeats every 20 to 30 s and detect dead peers from missed ones.',
    'Keeping business logic in the gateways that hold connections: every change then drops millions of sockets. Keep gateways thin and deploy logic behind them.',
    'Relying on a background socket on mobile: the OS suspends the app and the connection closes. Use APNs and FCM to wake it, and fetch the missed messages from the server rather than trusting the push payload.',
  ],
  followUps: [
    {
      question: 'Why not use WebSockets for everything?',
      answer:
        'They cost a stateful connection tier, custom reconnect and resume logic, heartbeats, and care with proxies and firewalls that break the upgrade. For one-way feeds SSE gives automatic reconnect with `Last-Event-ID` over plain HTTP, and for rare or broadcast updates polling a cached URL is cheaper still. Use WebSockets where the client also sends often or needs binary frames.',
    },
    {
      question: 'How do you show typing indicators without overloading the backend?',
      answer:
        'Treat them as ephemeral: send one when typing starts and repeat it every few seconds while it continues, let the recipient expire it after about 5 s, never store it, and drop it under load. Route it through the same gateway lookup as messages but over the fire-and-forget pub/sub path only.',
    },
    {
      question: 'How do you load-balance long-lived connections fairly?',
      answer:
        'Round robin balances new connections, not existing ones, so a freshly started gateway stays nearly empty while old ones hold most clients. Balance on least connections, cap each gateway, and rebalance slowly by closing a small share of connections on the fullest gateways so their clients reconnect elsewhere with jitter.',
    },
  ],
};
