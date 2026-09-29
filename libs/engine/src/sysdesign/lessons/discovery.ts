import type { SdLesson } from './types.js';

export const DISCOVERY_LESSON: SdLesson = {
  why: 'In a fleet that autoscales, deploys and loses machines every day, a caller cannot hard-code where a service lives: it has to discover the live instances, and learn quickly when one dies. Every discovery design leaves a window in which traffic still goes to a dead instance, and its length (a DNS TTL, missed heartbeats plus a client cache, or failed health checks) decides how many requests fail. Interviewers probe that window, what it costs to shrink it, and how a deploy avoids opening it at all.',
  widget: {
    kind: 'discovery',
    tryThis: [
      'Pick DNS with a 60 s TTL: one of 20 instances dies while it takes 500 of the 10,000 requests a second, so for up to 60 s about 30,000 requests go to it, at zero checks a second. Slide the TTL to 300 s: 150,000 requests. Slide it to 5 s: 2,500. And real clients can cache past the TTL, so this is the best case.',
      'Pick the registry with heartbeats every 10 s, 3 missed beats and a 30 s client cache: 60 s and 30,000 requests at 2 heartbeats a second. Set the cache to 0, as if the registry pushed changes: 30 s and 15,000. Now set heartbeats to every 1 s: 3 s and 1,500 requests, for 20 heartbeats a second. Detection time and client caching add up, so fix the larger one first.',
      'Pick the load balancer with checks every 5 s and 3 failures in a row: 15 s, 7,500 requests, 4 checks a second. Check every 1 s: 3 s and 1,500 requests at 20 checks a second. Set failures to 1: 1 s and 500 requests, but now a single slow check, from a GC pause or a dropped packet, pulls a healthy instance out.',
    ],
  },
  concepts: [
    {
      title: 'Why static host lists fail',
      body: 'A config file of addresses works for three servers that never change. With autoscaling, rolling deploys and machine failures, addresses change many times a day: every change needs a config push to every caller, a dead host stays in the list until someone notices, and a new one gets no traffic until the next push. Discovery replaces the list with a source of truth that instances join and leave on their own, plus a way for callers to learn about changes.',
    },
    {
      title: 'DNS-based discovery and TTLs',
      body: 'The simplest registry is DNS: a name resolves to the current instances (A records, or SRV records that also carry ports), and callers need nothing special. The TTL bounds how long resolvers may cache an answer, so a dead instance keeps traffic for up to a TTL after its record is removed. In practice it can be longer: some runtimes and libraries cache lookups past the TTL, pooled keep-alive connections never re-resolve until they close, and a failed lookup (NXDOMAIN) is cached too, for up to the time the zone SOA record allows (negative caching), so a name queried before it existed can stay missing. Plain DNS also has no idea whether an instance is healthy; something must remove the record.',
    },
    {
      title: 'Client-side versus server-side discovery',
      body: 'Client-side: instances register in a registry (Consul, etcd, ZooKeeper, Eureka), callers read or watch the live list and pick an instance themselves, as gRPC client load balancing does. There is no extra hop, and callers can balance smartly, but every language needs the client library. Server-side: callers send to one stable address, a load balancer or a virtual IP such as a Kubernetes Service, and that tier knows the endpoints. Callers stay simple, at the cost of an extra hop and a tier that must scale and stay available. The registry itself holds critical state: etcd and ZooKeeper replicate it with a majority protocol, while Eureka favors availability and may serve a stale list.',
    },
    {
      title: 'Heartbeats and failure detection',
      body: 'A registry learns an instance died when its heartbeats stop: ZooKeeper deletes its ephemeral node when the session expires, and etcd deletes its key when the lease runs out without a keep-alive. The timeout is heartbeat interval times missed beats, and it is a trade-off. Short timeouts detect deaths fast but evict healthy instances that stalled on a GC pause or a network blip, and a partitioned registry can evict many at once; long timeouts keep dead instances in rotation. Heartbeat cost grows with the fleet: 10,000 instances every second is 10,000 writes a second. Phi accrual detectors (used by Cassandra and Akka) replace the fixed timeout with a suspicion level computed from how late the next heartbeat is compared with the recent spread of arrival gaps, so a naturally jittery link is judged more leniently.',
    },
    {
      title: 'Health checks: liveness, readiness, shallow and deep',
      body: 'A load balancer, or an orchestrator, probes each instance. Liveness asks whether the process is stuck and should be restarted; readiness asks whether it should get traffic now, and it is false while warming up, while draining, or while overloaded. In Kubernetes, a failed liveness probe restarts the container and a failed readiness probe only removes the pod from the Service endpoints. A shallow check (the process answers) is cheap and local. A deep check that also queries the database or a downstream service is dangerous: when that shared dependency blips, every instance fails its check at once and the balancer removes all of them, turning a partial slowdown into a full outage. Keep checks about the instance itself, and report dependency health through metrics. For exactly this reason, many balancers fail open: an AWS load balancer routes to every target when all are unhealthy, and Envoy ignores health once fewer than 50% of hosts pass (its default panic threshold).',
    },
    {
      title: 'Service mesh: sidecars and a pushing control plane',
      body: 'A service mesh puts a proxy such as Envoy beside every instance, and the application talks only to its local sidecar. A control plane (Istio, for example) watches the source of truth, such as Kubernetes endpoints, and pushes endpoints, routes and cluster settings to every proxy over long-lived gRPC streams, the xDS APIs (EDS carries endpoints). Pushing removes the client polling delay. The proxies add passive checks too: outlier detection ejects a host after a run of errors seen on real traffic, which catches a bad instance before the next active check. The price is a proxy hop, per-instance memory, and a control plane whose pushes must scale with fleet size times churn.',
    },
    {
      title: 'Graceful shutdown: deregister, drain, then stop',
      body: 'Most dead-instance errors in practice come from planned stops, and they are avoidable. First take the instance out of discovery (deregister, or fail readiness) and wait for that change to reach every caller. Then drain: stop accepting new work, finish the requests in flight, and close keep-alive connections politely (HTTP/1.1 `Connection: close`, HTTP/2 GOAWAY). Only then exit. Kubernetes sends SIGTERM while the pod is being removed from endpoints, in parallel, so a short preStop sleep covers the propagation delay; load balancers offer a deregistration delay that keeps existing connections alive while no new ones arrive.',
    },
    {
      title: 'Configuration and feature flags are the same problem',
      body: 'Distributing config and feature flags is discovery for settings: a source of truth (etcd, Consul KV, a flag service) and many readers that cache it. Polling trades staleness for load exactly like a client cache; watches or streaming push changes in seconds. Readers must keep serving with the last known values when the source is down, never block startup on it forever, and changes should roll out gradually, because a bad value pushed instantly reaches every instance at once.',
    },
  ],
  examples: [
    {
      title: 'Pick a DNS TTL for an internal service',
      problem:
        'An internal API runs 50 instances behind DNS round robin and serves 20,000 requests a second. The record TTL is 300 s. When an instance dies, how many requests go to it, and what does a shorter TTL cost?',
      insight:
        'The failed requests are the share of traffic one instance takes times the time callers keep the old answer, and the TTL is only the lower bound of that time.',
      steps: [
        'Each instance takes 20,000 / 50 = 400 requests a second.',
        'Once the record is removed, callers may keep the dead address for up to 300 s: 400 × 300 = 120,000 requests go to it.',
        'At a 30 s TTL that drops to 400 × 30 = 12,000. The cost is lookups: 5,000 client hosts that each resolve once per TTL make about 17 lookups a second at 300 s and about 167 at 30 s, trivial for a resolver.',
        'The TTL does not cover everything: a pooled keep-alive connection to the dead host never re-resolves until it breaks, and some runtimes cache lookups longer. Set connection lifetimes and timeouts so callers reconnect and re-resolve.',
        'A host that vanished entirely does not refuse connections, it just never answers, so each attempt waits for the connect timeout. Keep that timeout short (say 1 s) and retry on another address.',
      ],
    },
    {
      title: 'Tune a registry: detection versus false evictions',
      problem:
        '2,000 instances heartbeat to a registry every 5 s and are dropped after 3 missed beats; callers poll the registry every 30 s. The service takes 100,000 requests a second. How long does a dead instance get traffic, and how would you shorten it?',
      insight:
        'Stale time is detection plus propagation; shorten the cheaper part first, and do not cut detection below the pauses healthy instances actually have.',
      steps: [
        'Detection takes 5 × 3 = 15 s, and a caller that polled just before the eviction learns of it up to 30 s later: 45 s worst case.',
        'Each instance takes 100,000 / 2,000 = 50 requests a second, so 50 × 45 = 2,250 requests go to a dead one.',
        'Replace polling with a watch, so the registry pushes the change: the window falls to about 15 s, or 750 requests, with no extra heartbeat load.',
        'Heartbeats every 1 s would cut detection to 3 s, but the registry handles 2,000 heartbeats a second instead of 400, and any GC pause or network blip longer than 3 s evicts a healthy instance, which then rejoins: flapping.',
        'Cover the remaining window on the caller: a short timeout, a retry on a different instance for idempotent requests, and outlier ejection after a few consecutive errors, which reacts within a second or two at 50 requests a second.',
      ],
    },
    {
      title: 'A rolling deploy that fails requests',
      problem:
        'A service runs 20 instances behind a load balancer at 10,000 requests a second. Health checks run every 5 s and need 3 failures in a row. The deploy script stops each instance with an immediate kill. How many requests fail per deploy, and how do you get to zero?',
      insight: 'A planned stop should never rely on failure detection: take the instance out of rotation first, then drain, then exit.',
      steps: [
        'Each instance takes 10,000 / 20 = 500 requests a second.',
        'After the kill, the balancer keeps routing to it until 3 checks fail, up to 5 × 3 = 15 s: 500 × 15 = 7,500 failed requests, plus whatever was in flight.',
        'Twenty instances, one at a time: 20 × 7,500 = 150,000 failed requests on every deploy.',
        'Fix the order: deregister the instance (or fail its readiness check), wait for the balancer to stop sending new requests, let in-flight requests finish up to the longest request timeout, then exit. Nothing is routed to a dead process.',
        'Check capacity: while one instance drains, the other 19 carry 10,000 / 19, about 526 requests a second each, 5% more, so keep that headroom or add the new instance before removing the old.',
      ],
    },
  ],
  pitfalls: [
    'Assuming a DNS change takes effect after one TTL: pooled connections, runtimes that cache lookups longer and negative caching all stretch it.',
    'Deep health checks that call a shared database or downstream: when it blips, every instance fails at once and the balancer removes the whole fleet.',
    'Heartbeat timeouts shorter than real pauses (GC, a busy host, a network blip): healthy instances are evicted and rejoin in a loop.',
    'Shutting down on SIGTERM without deregistering and draining first, so every deploy fails the requests of the detection window.',
  ],
  followUps: [
    {
      question: 'What happens to discovery if the registry itself goes down?',
      answer:
        'Callers should keep using their last known list, which is usually still almost right, and keep outlier detection on to route around deaths meanwhile. New instances cannot register, so scaling and deploys stall. Run the registry as a replicated cluster across zones, and never make a request path call the registry synchronously.',
    },
    {
      question: 'Why not just use DNS with a 1 second TTL?',
      answer:
        'Many resolvers and clients do not honor very low TTLs, pooled connections ignore DNS entirely, and every lookup adds latency and resolver load. DNS also carries no health, only whatever records exist. It suits coarse, slowly changing endpoints; for fast-changing fleets, use a registry with watches or a mesh that pushes endpoints.',
    },
    {
      question: 'Should a health check fail when the database is down?',
      answer:
        'Usually not. Removing every instance does not bring the database back, and with no instances left the service cannot even return a fast, clear error or serve cached data. Fail readiness only for problems local to the instance, surface dependency failures through metrics and alerts, and let circuit breakers handle the dependency.',
    },
  ],
};
