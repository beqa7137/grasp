import type { SdLesson } from './types.js';

export const LOAD_BALANCING_LESSON: SdLesson = {
  why: 'Every horizontally scaled service sits behind a load balancer, and its policy decides both the tail latency at normal load and what happens when one server goes bad. A policy that ignores how busy servers are keeps feeding a degraded server its full share until its queue holds minutes of work, and that slow server still passes every health check. Interviewers probe which layer you balance at, what the balancer knows about each server, how a bad server leaves the pool, and what affinity costs.',
  widget: {
    kind: 'balancer',
    tryThis: [
      'Set 10 servers, 70% load, no slow server, and pick Random: the mean is about 35 ms, close to the 10 / (1 - 0.7) = 33 ms of a single server queue, the p99 is about 175 ms and one server once held 23 requests. Switch to Round-robin: about 19 ms mean and 82 ms p99. Least connections: about 11 ms mean, 51 ms p99, and no server ever holds more than 3. Two random choices lands at about 17 ms and 68 ms: most of the gain from looking at only two servers.',
      'Keep 10 servers at 70% and set the slow server to 5x. Round-robin still sends it exactly 10% of the requests, though it can serve only about 2% of the fleet total: the mean jumps to about 3.5 s, the p99 to about 65 s, and its queue reaches about 1,380 and is still growing when the run ends. Random is no better. Least connections sends it about 3%, with a mean of about 14 ms and a p99 of about 96 ms; two random choices also sends it about 3%, at about 21 ms and 163 ms.',
      'Pick Round-robin with 10 servers and a 2x slow server at 50% load: the slow server gets 10% of the requests, about 95% of what it can serve, so the mean is about 34 ms but the p99 already reaches about 450 ms. Raise the load to 70%: it now receives a third more than it can serve, and the mean climbs to about 560 ms and the p99 to about 10 s. Least connections at 70% stays at about 12.5 ms and 62 ms.',
      'With no slow server at 70%, step the servers from 4 to 10 to 20. Random stays at about 34 ms each time, because each server is still its own queue at 70%. Least connections falls from about 15 ms to 11 ms to 10 ms: the bigger the pool, the more often it finds an idle server, and 10 ms is the bare service time.',
    ],
  },
  concepts: [
    {
      title: 'L4 versus L7',
      body: "An L4 balancer works on TCP or UDP connections by address and port: it picks a backend once per connection and forwards bytes without reading them, so it is fast and cheap but cannot see requests. An L7 balancer terminates the connection (usually TLS too), parses HTTP, and picks a backend per request: it can route by path or header, retry, and count requests in flight, at the cost of more CPU and a little latency. The difference bites with long-lived connections: HTTP/2 and gRPC multiplex many requests on one connection, so an L4 balancer pins all of a client's traffic to one backend, and only L7 or client-side balancing spreads it.",
    },
    {
      title: 'Static policies: round-robin, weighted, random',
      body: 'Round-robin hands requests to servers in turn; weighted round-robin gives a server twice as big twice the turns. Random picks uniformly, and over many requests each server gets the same share, but in bursts: each server then behaves like a single server queue, 10 / (1 - 0.7) = 33 ms at 70% with 10 ms of work. Round-robin spreads arrivals more evenly, so queues are shorter. None of them looks at the servers: a server that slows down keeps receiving its fixed share whether or not it can serve it, and weights set by hand cannot follow a degradation nobody planned.',
    },
    {
      title: 'Least connections and least outstanding requests',
      body: "Least connections (at L4) or least outstanding requests (at L7) sends each request to the server with the fewest in flight. A server that is slow, or stuck on a heavy request, holds its work longer, so its count stays high and it gets less new work: the policy adapts to capacity without being told. The widget's balancer sees exact counts for every server; in a real fleet each balancer instance counts only the requests it sent itself, and a server that fails fast (errors in 1 ms) looks idle and attracts traffic, so errors must count against it.",
    },
    {
      title: 'Two random choices and the herd',
      body: "Pick two servers at random and send the request to the less busy one. Theory and the widget agree: this removes most of the gap between random and least connections, while touching two counters instead of scanning the fleet. It also stays good when load information is stale. When many balancers share load reports refreshed every second, least-loaded choice sends everyone to the same apparently idle server until the next report: a herd. With two choices from 100 servers, that server is in a sample only 2% of the time, so it gets about twice its share, not all of it. Envoy's least request and NGINX `random two least_conn` work this way.",
    },
    {
      title: 'Health checks and outlier ejection',
      body: 'Active checks probe each server, say `GET /health` every 5 s, and remove it after a few failures in a row, so detection takes 10 to 15 s. Passive checks watch real traffic: outlier ejection removes a server after, for example, 5 consecutive 5xx responses or timeouts, for 30 s, then lets it back in and ejects it for longer if it fails again. Cap ejection at a fraction of the pool so a bad signal cannot empty it. A slow server usually passes a shallow check, so rely on latency-aware balancing and timeouts; and keep checks shallow, since a check that calls the database fails every server at once when the database blips.',
    },
    {
      title: 'Affinity: consistent hashing and sticky sessions',
      body: 'Sometimes the same key should reach the same server: a cache shard, a local cache worth warming, in-memory session state. Hashing the key modulo N remaps almost every key when N changes; consistent hashing places servers and keys on a ring so adding an 11th server to 10 moves only about 1/11 of the keys. Sticky sessions pin a user by cookie or source IP. Both cost balance: a hot key or heavy user overloads its server, and a slow server keeps its users. Bounded-load consistent hashing caps each server at, say, 1.25 times the average and spills the rest to the next server on the ring. Prefer externalized state, and use affinity for locality, not correctness.',
    },
    {
      title: 'Draining and slow start',
      body: 'To remove a server for a deploy or scale-in, stop sending it new requests, let those in flight finish, then stop it: the server fails its readiness check, and the balancer waits up to a drain timeout (300 s by default for AWS target groups). HTTP/1.1 connections are closed with `Connection: close` and HTTP/2 ones with `GOAWAY`; WebSockets may never finish, so cap the wait and let clients reconnect. A new server needs the opposite, slow start: ramp its share up over tens of seconds while caches, connection pools and the JIT warm up.',
    },
    {
      title: 'Global load balancing: DNS and anycast',
      body: 'Across regions, DNS-based balancing answers each lookup with the address of a nearby healthy region. It is simple, but failover waits on TTLs that some resolvers and clients stretch, and it sees the resolver location rather than the user unless the resolver forwards the client subnet. Anycast announces one IP address from many sites over BGP, so the network delivers each packet to a nearby site and a withdrawn route moves traffic as fast as BGP converges, typically within seconds to tens of seconds. Large providers combine them: anycast to the nearest edge, then L7 balancing to a backend region with capacity.',
    },
  ],
  examples: [
    {
      title: 'Pick a policy for 10 API servers at 70%',
      problem:
        'Ten servers each answer a request in 10 ms on average, so each serves 100 requests a second and the fleet 1,000. Traffic is 700 a second. Compare random, round-robin, least outstanding requests and two random choices, now and at 900 a second.',
      insight: 'What a policy knows about in-flight work matters little at low load and decides the tail as utilization climbs.',
      steps: [
        'Random gives each server a random 70 requests a second, so each behaves as a single queue at 70%: the mean time in system is 10 / (1 - 0.7), about 33 ms, and the widget shows about 35.',
        'That time is exponentially distributed, so its p99 is the mean times ln 100, about 4.6: 33 × 4.6 is about 150 ms, three times the p99 of about 51 ms that least connections gets.',
        'Round-robin gives each server every tenth request, far more regular than random arrivals, and the mean falls to about 19 ms. Least connections behaves close to one shared queue for all 10 servers: at 70% most requests find an idle server, so the mean is about 11 ms, barely above the 10 ms of work.',
        'At 900 a second, random rises toward 10 / (1 - 0.9) = 100 ms (the widget shows about 93), round-robin to about 49 ms, two random choices to about 30 ms, and least connections to about 18 ms.',
        'Choose least outstanding requests on a single L7 tier, or two random choices when many balancer instances share the fleet; both also back off from a slow server, which round-robin never does.',
      ],
    },
    {
      title: 'A server that got 5 times slower',
      problem:
        'The same 10 servers of 100 requests a second take 644 requests a second. One develops a bad disk and now takes 50 ms a request, yet still answers `GET /health` with 200. Round-robin is in use. What happens over a minute, and what fixes it?',
      insight: 'A static policy sends a slow server its fixed share whatever its capacity, and a shallow health check cannot see slowness.',
      steps: [
        'The slow server now serves 1,000 / 50 = 20 requests a second, a fifth of the others. The fleet can serve 9 × 100 + 20 = 920, so 644 is 70% of it: on paper there is plenty of room.',
        'Round-robin sends it a tenth of the traffic, 64.4 a second, 3.2 times what it can serve. Its queue grows by 44.4 a second: after 60 s it holds about 2,660 requests, and a new arrival waits 2,660 / 20, about 133 s.',
        'A tenth of all requests time out, and retries that land there add to the queue, while the other nine servers sit at about 64% and look fine on a fleet dashboard.',
        'Least outstanding requests fixes it without configuration: the slow server holds its requests 5 times longer, so it looks busy and receives about 3% of the traffic, near its 20 / 920, about 2%, of the capacity. The widget shows the p99 falling from about 65 s to about 96 ms.',
        'Then remove it: outlier ejection on timeouts or latency, or an alert on per-server p99. Without it the fleet serves 900 a second, and 644 is still a safe 72%.',
      ],
    },
    {
      title: 'The herd on a freshly started server',
      problem:
        '20 load balancer instances front 100 servers that each serve 150 requests a second. Traffic is 10,000 a second, 100 per server. Load reports reach every balancer once a second. A restarted server reports 0 in flight. Compare least-loaded choice on those reports with two random choices.',
      insight:
        'When many balancers act on the same stale view, choosing the global minimum sends them all to one place; random sampling spreads them.',
      steps: [
        'Least-loaded: every balancer sees the new server as the emptiest for a whole second, so it receives all 10,000 requests in that second.',
        'At 150 a second, that is about 67 s of queued work for a server whose caches are still cold, and the next report shows it swamped, so the herd moves to whichever server now looks emptiest.',
        'Two random choices from 100 servers includes the new server with probability 1 - (99 / 100)(98 / 99) = 2 / 100, and it wins when included, so it receives about 2% of 10,000, or 200 a second.',
        'That is twice its fair 100 and a third over its 150 capacity, for one second: about 50 requests of backlog, a third of a second of queue, gone after the next report.',
        'Add slow start so a restarted server ramps up its share over 30 to 60 s, and prefer counts each balancer tracks itself over shared reports.',
      ],
    },
  ],
  pitfalls: [
    "Balancing gRPC or HTTP/2 at L4: each client's long-lived connection pins all its requests to one backend, so a few busy clients overload a few servers while others idle.",
    'Round-robin or random in front of servers that can degrade: they keep sending a slow server its full share until its queue holds minutes of work.',
    'Trusting a shallow health check to catch a bad server: a slow or half-broken server still returns 200 on `/health`. Add passive checks on errors, timeouts and latency.',
    'Least connections toward a server that fails fast: errors in 1 ms make it look idle, so it draws most of the traffic and fails most of the requests.',
    "Sticky sessions instead of shared state: load skews, a dead server loses its users' sessions, and deploys wait for sessions to drain.",
  ],
  followUps: [
    {
      question: 'Why do proxies such as Envoy use two random choices rather than exact least connections?',
      answer:
        'A fleet has many proxy instances, each seeing only its own in-flight counts or stale shared ones. Exact least-loaded choice on such information herds onto the same server, and it needs a scan of every host. Two random choices costs two lookups, gets most of the benefit, and spreads load even when the counts are out of date.',
    },
    {
      question: 'You have 10 cache servers keyed by `hash(key) % 10` and add an 11th. What happens?',
      answer:
        'A key stays put only when hash mod 10 equals hash mod 11, which holds for 1 key in 11, so about 91% of keys move and the hit rate collapses while the database takes the misses. Consistent hashing moves only the keys the new server takes over, about 1/11 or 9%. Use many virtual nodes per server to keep shares even, and bounded loads to protect against hot keys.',
    },
    {
      question: 'A region goes down. How does global traffic move, and how fast?',
      answer:
        'With DNS, health checks stop returning the region, but clients keep cached answers until the TTL expires, and some keep them longer, so a 60 s TTL can mean minutes for part of the traffic. With anycast, the region stops announcing its routes and BGP moves packets to the next site within seconds to tens of seconds, though connections in progress break and must reconnect. Either way, the other regions need the headroom to take its traffic.',
    },
  ],
};
