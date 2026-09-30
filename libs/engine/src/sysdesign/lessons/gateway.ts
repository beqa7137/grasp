import type { SdLesson } from './types.js';

export const GATEWAY_LESSON: SdLesson = {
  why: 'Every request from outside passes the API gateway, and in a service mesh every call between services passes two more proxies, so whatever they do is paid on every request: a token check, a TLS handshake, a retry policy. Chosen well, they take authentication, encryption and resilience out of each service; chosen carelessly, they add milliseconds per hop, a hot dependency on the auth server and a single place where one bad config takes everything down. Interviewers probe what belongs at the edge, what belongs in the mesh, and what each one costs.',
  widget: {
    kind: 'gateway',
    tryThis: [
      'Pick signed JWT with 4 hops and the mesh off: the gateway adds 0.1 ms and makes 0 calls a second to the auth server. Switch to introspection with the cache at 0%: 5.0 ms and 10,000 calls a second, one for every request. Raise the cache to 90%: 0.5 ms and 1,000 calls; at 99%, 0.1 ms (0.05 before rounding) and 100 calls, no dearer than a JWT on average, but a revoked token keeps working until its cached answer expires.',
      'Pick signed JWT, turn the mesh on with sidecars at 0.5 ms, and set 1 hop: 2 proxies and 1.1 ms. Set 4 hops: 8 proxies and 4.1 ms; 8 hops: 16 proxies and 8.1 ms. Each hop leaves one sidecar and enters another, so the cost grows with the depth of the call chain, not with the number of services.',
      'Keep the mesh on with 8 hops and set the sidecar to 2 ms: 32.1 ms, more than a tight latency budget allows on its own. Drop it to 0.25 ms: 4.1 ms, the same as 4 hops at 0.5 ms. Now pick introspection at 90% with 4 hops at 0.5 ms: 4.5 ms, of which the token check is only 0.5; with a deep chain the proxies, not authentication, dominate what the infrastructure adds.',
    ],
  },
  concepts: [
    {
      title: 'What the gateway does',
      body: 'The API gateway is the one entry point for traffic from outside (north-south traffic). It routes by host, path or header to the right service, terminates TLS, authenticates the caller, enforces rate limits and quotas per client or API key, and shapes requests: header rewrites, size limits, request ids, API versions. It can also aggregate: one client call fans out to several services and returns one response. A backend for frontend is a gateway per client type (mobile, web), shaped to what that client needs, so a phone makes one call instead of six.',
    },
    {
      title: 'A single point that must not be one',
      body: 'Everything passes the gateway, so it is a potential single point of failure and a bottleneck. Keep it stateless and run several instances across zones behind a layer 4 load balancer or DNS, sized so that losing a zone leaves enough capacity. Keep state it needs, such as rate limit counters, in a shared store or accept approximate local limits. The most common gateway outage is not load but a bad config or plugin pushed to every instance at once, so roll out gateway changes in stages like code, and keep business logic out of it.',
    },
    {
      title: 'Signed JWTs: checked locally',
      body: 'A JWT carries its claims (user, scopes, audience, expiry) and a signature from the auth server. The gateway checks the signature with the public key, fetched once from the issuer (a JWKS endpoint) and cached, then checks expiry, issuer and audience, all without a network call: tens of microseconds. The catch is revocation: a valid signature stays valid until expiry, so a stolen or revoked token keeps working. The usual answer is short-lived access tokens (5 to 15 minutes) plus a refresh token that the auth server checks, and can refuse, on every refresh; for emergencies, push a small denylist of token ids to the gateways.',
    },
    {
      title: 'Opaque tokens and introspection',
      body: 'An opaque token is a random string that means nothing without the auth server. The gateway asks the auth server whether it is active and what it grants (OAuth token introspection, RFC 7662), so revocation takes effect on the next check. The price is a network call per request and a hard dependency: if the auth server is slow or down, so is every API. Caching the answer by token cuts the calls, but a cached answer outlives a revocation by up to the cache TTL, so the TTL is your revocation delay, and it must never exceed the token lifetime. A hit rate also depends on reuse: a token seen once per TTL always misses.',
    },
    {
      title: 'Service mesh: sidecars, control plane, mTLS',
      body: 'A service mesh handles traffic between services (east-west). In the sidecar model each pod gets a proxy, typically Envoy (Istio) or a purpose-built proxy (Linkerd), and traffic is redirected through it, so a call leaves one sidecar and enters another. The control plane (istiod in Istio) does not carry traffic: it pushes routes, policies and certificates to the proxies. It acts as a certificate authority, issuing each workload a short-lived certificate for its identity and rotating it automatically, so every call can be mutual TLS (Istio accepts plaintext too until you set strict mode): encrypted, and each side knows which service is calling. Authorization can then be written as which service may call which.',
    },
    {
      title: 'Resilience and observability in the mesh',
      body: "The sidecar applies timeouts, retries with budgets, and circuit breaking (connection and request limits, plus outlier detection that ejects an endpoint returning errors) uniformly, in config instead of in each language's client library. It also emits request rate, errors and latency for every call between services, with no code changes. Tracing needs one piece from the application: the proxies create spans, but only the service can copy the trace headers from its incoming request to its outgoing calls, so without that the spans never join into one trace.",
    },
    {
      title: 'What sidecars cost, and the alternatives',
      body: 'Each proxy adds latency on every call, from well under a millisecond to a few milliseconds depending on load, payload, TLS and which layer 7 features run, and it adds CPU and memory to every pod; its memory grows with the config it holds, so scope each proxy to the services it calls. Sidecarless designs move the proxy out of the pod. Istio ambient mode runs a per-node proxy (ztunnel) that handles mTLS and layer 4 policy, and adds an Envoy waypoint proxy only for services that need layer 7 features. Proxyless gRPC has the gRPC library take routing and policy from the control plane directly, with no proxy at all, but it covers only gRPC services and its features vary by language. Measure in your own setup before trusting any published number.',
    },
    {
      title: 'When a mesh is worth it',
      body: 'A mesh pays when there are many services owned by many teams, written in several languages (so a shared client library cannot enforce retries, timeouts and mTLS), or when a zero-trust or compliance rule demands encrypted, authenticated calls between every pair of services. It rarely pays for a handful of services in one language: a good client library, a load balancer and TLS give most of the benefit, without a control plane to upgrade, proxies to debug and a latency tax on every hop.',
    },
  ],
  examples: [
    {
      title: 'JWT or introspection at 10,000 requests a second',
      problem:
        'An API takes 10,000 requests a second. The auth server answers an introspection call in 5 ms and one instance handles 2,500 calls a second. Security wants a revoked session cut off within 1 minute. Which token check, and what does each option cost?',
      insight:
        'Count calls to the auth server and the revocation delay for each option: a cache TTL and a JWT expiry are the same knob, trading load for how long a revoked token still works.',
      steps: [
        'Introspection with no cache: 10,000 calls a second to the auth server and 5 ms added to every request. That is 10,000 / 2,500 = 4 instances before any headroom, and an auth server outage is an API outage. Revocation is immediate.',
        'Cache answers for 60 s, which meets the 1 minute rule. If a typical token makes 10 requests a minute, about 9 in 10 hit: 1,000 calls a second and 0.5 ms added on average, though each miss still pays the full 5 ms.',
        'Signed JWTs: 0 calls a second and 0.1 ms per request, but a revoked token works until it expires. A 15 minute expiry breaks the 1 minute rule; even 5 minutes does.',
        'To keep JWTs, pair short tokens with refresh: with 300,000 active sessions and 5 minute tokens, the auth server sees 300,000 / 300 = 1,000 refreshes a second, the same load as the cached introspection, and revokes by refusing the refresh. To reach 1 minute, push a denylist of revoked token ids to the gateways, kept only until those tokens expire.',
        'Either works; the choice is which dependency you prefer: a cache in front of a live auth server, or a denylist pushed to every gateway. Many teams use opaque tokens outside and have the gateway swap them for a short-lived JWT for the services behind it.',
      ],
    },
    {
      title: 'The latency and resource budget of a mesh',
      problem:
        'A checkout request passes the gateway and then a chain of 6 services. The p50 budget for what the infrastructure adds is 5 ms. Sidecars cost about 0.5 ms each, the gateway checks a JWT, and the cluster runs 400 pods. Does a sidecar mesh fit?',
      insight: "Two proxies per hop, times the depth of the chain, is the mesh's latency; one proxy per pod is its memory and CPU.",
      steps: [
        '6 hops mean 12 proxies: 12 times 0.5 = 6 ms, plus 0.1 ms for the JWT, so 6.1 ms. That is over the 5 ms budget before a single retry.',
        'Calls made in parallel do not add up: if the checkout service calls pricing, inventory and shipping at once, only the slowest branch counts. Flattening the chain from 6 serial hops to 3 cuts the proxies to 6 and the cost to 3.1 ms.',
        'Resources, assuming each sidecar reserves 0.1 vCPU and 60 MB: 400 pods times that is 40 vCPU and 24 GB, before counting the control plane.',
        'A per-node proxy (Istio ambient) for mTLS and layer 4 policy replaces 400 sidecars with one proxy per node, and adds a layer 7 waypoint only for services that need retries or header routing. Measure the per-hop cost again after the change rather than assuming it.',
        'If the only hard requirement is encryption between services, compare against mTLS in the client library or at the platform level; the mesh earns its cost when you also want uniform policy and telemetry across many languages.',
      ],
    },
    {
      title: 'Scale the gateway so it is not the outage',
      problem:
        'The gateway fleet serves 10,000 requests a second at peak across 3 zones. One instance handles 2,500 a second at your target utilization. Each API key may make 1,000 requests a second. How many instances, and where do the rate limit counters live?',
      insight: 'Size for peak with a zone lost, and decide whether a limit must be exact before paying for a shared counter.',
      steps: [
        '10,000 / 2,500 = 4 instances needed at peak.',
        'Losing one of 3 zones must leave at least 4, so run 2 per zone: 6 instances, 4 left after a zone failure.',
        'Rate limits with local counters: a key spread over 6 instances gets 1,000 / 6, about 167 a second on each. That is exact only if the load balancer spreads each key evenly; skewed traffic throttles a key early on one instance.',
        'A shared counter in Redis gives an exact 1,000, at the cost of a round trip per request and a new dependency. The middle way: count locally and sync with the shared store every 100 ms or so, accepting a small overshoot.',
        'Finally, protect against the likelier outage: ship gateway config to one instance or one zone first and watch errors before rolling it to all 6.',
      ],
    },
  ],
  pitfalls: [
    'Putting business logic in the gateway: it becomes a shared monolith that every team must change and deploy through, and every bug in it hits every API.',
    'Long-lived JWTs with no revocation path, or checking only the signature: always check expiry, issuer and audience, and pin the accepted algorithms so a token cannot pick `alg: none`.',
    'Caching introspection answers longer than the revocation promise: the cache TTL is exactly how long a revoked token still works.',
    'Retrying in both the application and the mesh: 3 attempts in the client times 3 in the sidecar is 9 calls, and if each of 3 levels in a chain retries 3 times, the bottom service sees 27 calls for one request. Retry in one layer, with a budget.',
    'Expecting the mesh to give distributed tracing for free: the proxies record spans, but each service must copy the trace headers from its incoming request to its outgoing calls.',
  ],
  followUps: [
    {
      question: 'How is an API gateway different from a load balancer and from a service mesh?',
      answer:
        'A load balancer spreads connections or requests across instances of one service. A gateway works at the API level for traffic from outside: it routes to many services, authenticates callers, applies per-client limits and reshapes requests. A mesh governs calls between services inside: identity, mTLS, retries, timeouts and telemetry for east-west traffic. They overlap, and several products (Envoy among them) serve as all three, but the jobs differ.',
    },
    {
      question: 'Should internal services see the token the client sent?',
      answer:
        'Often not. A common pattern keeps opaque tokens outside, so nothing about the user leaks to the client, and the gateway exchanges each for a short-lived signed JWT that it forwards inside. Services then check claims locally without calling the auth server, and service-to-service identity comes from mTLS. The internal token should carry only what services need and be scoped to an internal audience.',
    },
    {
      question: 'The auth server is down. What happens to the API?',
      answer:
        'With introspection, every cache miss fails, so new sessions and tokens past their cache TTL are rejected; failing open would let revoked tokens in, so most APIs fail closed and rely on the cache to ride out short outages. With signed JWTs, requests keep working until tokens expire, because nothing is called per request; only refreshes and logins fail. That resilience is one reason JWTs are popular despite the revocation problem.',
    },
  ],
};
