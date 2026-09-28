import type { SdLesson } from './types.js';

export const CDN_LESSON: SdLesson = {
  why: 'A content delivery network answers requests from hundreds of locations close to users, so most of them never cross an ocean or touch your servers. Whether it actually does depends on choices you make: how long objects stay cached, how many locations split your traffic, whether a shield tier sits in front of the origin, and how you push out changes. Interviewers use CDNs to test whether you can reason about hit rates, origin load and freshness, and whether you know what a CDN still does for traffic it cannot cache.',
  widget: {
    kind: 'cdn',
    tryThis: [
      'Keep the defaults: 10,000 requests a second for 100,000 objects whose popularity follows a Zipf curve, spread over 20 edge locations, each caching an object for 1 minute. About 69% of requests hit at the edge, and the origin still serves about 31%, some 3,100 requests a second. Turn on the origin shield: the edge hit rate does not move, but the origin share falls to about 9%, some 890 a second, and the mean response time from about 47 ms to about 30 ms.',
      'Turn the shield off and slide the edge locations. With 1 location the edge hits about 91%; with 5, about 80%; with 100, about 56%, and the origin now serves 44%, about 4,400 requests a second. The same traffic is split into more separate caches, so each sees an object less often before its copy expires. Turn the shield back on at 100 locations: the origin share drops to about 9% again, because the shield sees the misses of every location combined.',
      'At 20 locations without a shield, change the TTL. At 5 seconds the edge hits only about 49%; at 5 minutes, about 82%; at 1 hour, about 96%, and with the shield the origin serves about 26 requests a second. Now keep 1 minute and slide the traffic: at 1,000 requests a second the edge hits only about 50%, at 100,000 about 87%. More traffic means each object is asked for again sooner, so a CDN pays off most for the busiest content. The model assumes objects never change during their TTL and ignores cache size.',
    ],
  },
  concepts: [
    {
      title: 'Edge locations and how users reach them',
      body: 'A CDN runs caches in many points of presence (PoPs), from dozens to a few hundred cities, each with many servers. A user must be sent to a nearby one. With anycast (Cloudflare), every location announces the same IP address over BGP and the network delivers each packet to the closest one by routing distance; a failed location withdraws its route and traffic flows to the next. With DNS steering (Akamai, CloudFront), the DNS answer names a nearby location, chosen from the location of the resolver or, with EDNS Client Subnet, of the user. A round trip to a location 10 to 20 ms away replaces one of 100 to 250 ms to a distant origin.',
    },
    {
      title: 'Hit rate is per location',
      body: 'Each location keeps its own cache, so an object is fetched once per location, not once per CDN. An object requested once a second overall, spread over 20 locations, reaches each about every 20 seconds: with a 60 second TTL most requests hit. Spread over 100 locations it reaches each every 100 seconds, and most requests miss. This is why adding locations can raise origin load, and why long-tail content, requested rarely in any one place, gains little from the edge. Big objects such as video segments and software downloads are the easy case: few objects, many requests each.',
    },
    {
      title: 'Origin shields and request collapsing',
      body: 'An origin shield, or tiered cache, is one mid tier location that every edge asks on a miss before the origin. The shield sees the misses of all locations combined, so a moderately popular object is fetched from the origin about once per TTL instead of once per location per TTL. Request collapsing does the same within one location: while one request for a missing object goes to the origin, others for the same object wait for its answer instead of making their own. Together they protect the origin from a stampede when a popular object expires or is purged. The price is one more hop on a miss, usually a few tens of milliseconds.',
    },
    {
      title: 'Cache keys and what may be shared',
      body: 'A CDN stores each response under a cache key, by default the host, path and query string. The `Vary` response header adds request headers to the key: `Vary: Accept-Encoding` keeps compressed and plain copies apart, while `Vary: Cookie` or `Vary: User-Agent` splits one object into thousands of copies that almost never hit. Normalize keys: drop tracking parameters such as `utm_source`, sort the rest, and bucket devices into a few classes if the page really differs. A response that depends on who is asking must say `Cache-Control: private` or `no-store`, or one user can be served the page of another.',
    },
    {
      title: 'TTLs, revalidation and stale content',
      body: '`Cache-Control: max-age` sets freshness for every cache, and `s-maxage` overrides it for shared caches such as a CDN, so HTML can stay 60 seconds at the edge and 0 in the browser. When an object expires, the edge revalidates it with a conditional request (`If-None-Match` with its `ETag`), and an unchanged object costs a small 304 answer instead of the whole body. `stale-while-revalidate` lets the edge answer with the old copy while it refreshes in the background, so users never wait on the origin, and `stale-if-error` keeps serving the old copy when the origin fails.',
    },
    {
      title: 'Purging and versioned URLs',
      body: 'Static assets should never need a purge: put a content hash in the file name (`app.3f9a1c.js`), cache it for a year, and let each deploy reference the new names from HTML that is cached briefly. For content that must change in place, purge by URL, or by tag: surrogate keys (Fastly) or cache tags (Cloudflare) label every page that shows product 42, so one call invalidates all of them. Purges reach every location within seconds on some CDNs and minutes on others. A soft purge marks copies stale instead of deleting them, so with `stale-while-revalidate` users still get an instant answer while one request refreshes the object.',
    },
    {
      title: 'What a CDN does for traffic it cannot cache',
      body: 'Even personalized API calls gain from the edge. The TCP and TLS handshakes, two round trips before the first request on a new connection, finish at a nearby location, which forwards the request to the origin over connections it keeps open, often on a better-provisioned backbone. The edge also absorbs volumetric DDoS attacks with its combined capacity, runs a web application firewall and rate limits, and can run small programs (Cloudflare Workers, Lambda@Edge, Fastly Compute) for redirects, A/B assignment or token checks. Lock the origin down to CDN traffic only, or attackers simply go around it.',
    },
  ],
  examples: [
    {
      title: 'More locations, more origin load',
      problem:
        'A photo site serves 10,000 requests a second from 100,000 images through a CDN with 20 locations and a 60 second TTL, and the origin handles about 3,100 requests a second. The team moves to a plan with 100 locations to cut latency, and origin load rises to about 4,400 a second with the same traffic. What happened, and what fixes it?',
      insight:
        'The CDN fetches an object once per location, so spreading the same traffic over more locations lowers the hit rate of each.',
      steps: [
        'Take an image requested once a second overall. At 20 locations, each sees it about every 20 seconds, 3 times per 60 second TTL, so about 3 requests in 4 hit: a hit rate of 75% under the model r·T / (1 + r·T) with r·T = 3.',
        'At 100 locations each sees it every 100 seconds, 0.6 times per TTL, so the hit rate falls to 0.6 / 1.6, about 38%. Across all images the edge hit rate falls from about 69% to about 56%, and origin load rises from about 3,100 to 4,400 requests a second.',
        'An origin shield receives the misses of all 100 locations: for this image about 0.62 requests a second, 37.5 per TTL, so it hits about 97% and the origin fetches the image about once a minute.',
        'Across all images, the shield brings origin load to about 900 requests a second, lower than with 20 locations and no shield. Users near the new locations keep their faster edge hits; only misses pay about 30 ms more for the extra hop.',
        'Longer TTLs help too, if images never change in place: at one hour the edge hits about 88% even with 100 locations. Give each image version its own URL, and the TTL can be a year.',
      ],
    },
    {
      title: 'A purge that took down the origin',
      problem:
        'After a template change, a news site purges its whole CDN cache. It has 200 locations and about 20,000 pages that get steady traffic, and its origin renders at most 2,000 pages a second. Within a minute the origin is overloaded and pages time out. Why, and how should changes be pushed instead?',
      insight:
        'A purge turns every cached copy into a miss at once, so the origin must rebuild what the edge held, at every location at once.',
      steps: [
        'Without a shield, each of the 200 locations misses on each of the 20,000 hot pages: up to 200 × 20,000 = 4 million origin requests arriving in the first minutes, against a capacity of 2,000 a second. That is 2,000 seconds, over half an hour, of full origin capacity.',
        'Request collapsing keeps it to one fetch per page per location, and an origin shield to one per page overall: 20,000 renders, 10 seconds of origin capacity, spread as users arrive.',
        'Soft purge with `stale-while-revalidate` avoids the wait entirely: copies are marked stale, readers get the old page at once, and one request per page refreshes it in the background.',
        'Purge less: tag every page with the templates and articles it uses (surrogate keys), and purge only the tags that changed. A template change can roll out as pages expire naturally if a minute of the old layout is acceptable.',
        'Static assets need no purge at all: content-hashed file names mean a deploy only changes which names the HTML points to.',
      ],
    },
    {
      title: 'Speed up an uncacheable API for distant users',
      problem:
        'A shopping API runs in Virginia. Users in Sydney, about 200 ms away, wait over 600 ms for the first call of each session, even though the server answers in 20 ms. Most responses are personalized and cannot be cached. What can a CDN do?',
      insight:
        'Most of the first call is connection setup, and setup can finish at the edge even when the response cannot be cached there.',
      steps: [
        'A new HTTPS connection costs one round trip for TCP and one for TLS 1.3 before the request itself: 3 round trips of 200 ms, 600 ms, plus 20 ms of work.',
        'Through an edge location in Sydney, about 10 ms away, both handshakes take 20 ms. The edge forwards the request over a connection to Virginia it already holds open: 200 ms plus 20 ms of work. The first call drops to about 250 ms.',
        'Later calls on the same connection gain little: 200 ms direct against about 210 ms through the edge. The CDN pays off on new connections, on lossy mobile networks where the short hop retries faster, and with HTTP/3, which folds the handshakes into one round trip.',
        'Split out what is shared: catalog and price lists can be cached for 30 seconds with `s-maxage=30` and a minute of `stale-while-revalidate` and answered from Sydney in about 10 ms, while carts and accounts stay `private`.',
        'If personalized calls still dominate, the next step is a read replica or a regional deployment near Sydney, which is a data question, not a CDN one.',
      ],
    },
  ],
  pitfalls: [
    'Caching responses that depend on a cookie or an Authorization header without `private` or a matching cache key, so one user sees the account page of another.',
    'Letting tracking parameters or `Vary: User-Agent` into the cache key, which splits each object into thousands of copies and drops the hit rate to near zero.',
    'Purging the whole cache on every deploy instead of versioning static file names and purging by tag.',
    'Leaving the origin reachable directly: attackers skip the CDN firewall and DDoS protection. Accept only CDN traffic, by IP range or authenticated origin pulls.',
  ],
  followUps: [
    {
      question: 'How is a user sent to the nearest edge location?',
      answer:
        'Either anycast, where every location announces the same IP address and BGP routing delivers packets to the closest by network path, or DNS steering, where the DNS answer names a location chosen from the resolver address or, with EDNS Client Subnet, the user network. Anycast fails over by withdrawing a route; DNS steering reacts only as fast as the record TTL.',
    },
    {
      question: 'What should the CDN do when the origin is down?',
      answer:
        'Keep serving what it has: `stale-if-error` lets expired copies answer while the origin fails, so a static site or a catalog stays up for hours. Pages it never cached still fail, so serve a cached error page with a short TTL rather than letting every request hammer a recovering origin. A shield also keeps the retry load from every location off the origin.',
    },
    {
      question: 'How do you serve paid videos through a CDN only to subscribers?',
      answer:
        'Sign the URLs or set a signed cookie: the application issues a token that names the path prefix and an expiry and is signed with a key the CDN knows, and the edge checks it before serving from cache. The video segments stay cacheable and shared by all subscribers, while the check costs no origin request. Keep expiries short and rotate keys.',
    },
  ],
};
