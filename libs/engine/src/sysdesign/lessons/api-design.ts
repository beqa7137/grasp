import type { SdLesson } from './types.js';

export const API_DESIGN_LESSON: SdLesson = {
  why: 'The API is the part of a design that other teams and customers build on, so its mistakes outlive the code behind it: a list endpoint that slows down on deep pages, a payment call that charges twice when a phone retries, or a renamed field that breaks every mobile app still in the wild. Interviewers probe whether you can model resources and verbs cleanly, page through large and changing lists, make writes safe to retry, report errors a client can act on, and evolve the contract without breaking the clients you cannot upgrade.',
  widget: {
    kind: 'pagination',
    tryThis: [
      'Keep the defaults, Offset with 50 per page, page 10 and 3 new rows per page: this page reads 500 rows to return 50, since the database walks past the 450 it skips. Walking from page 1 to page 10 reads 2,750 rows in total, and 27 items show up twice, because each of the 9 page turns pushes 3 rows from the end of one page onto the start of the next. Switch to Cursor: 51 rows for this page (one index seek plus 50), 510 in total, and no repeats.',
      'Stay on Offset and slide the page to 100: this page reads 5,000 rows, the walk 252,500 and 297 items repeat. At page 1,000 it is 50,000 rows for one page, 25,025,000 for the walk and 2,997 repeats. Switch to Cursor: still 51 rows for the page and 51,000 for the whole walk. Offset cost grows with the page number, so reading every page grows with its square; a cursor pays the same for page 1,000 as for page 1.',
      'Back at page 10 on Offset, slide the new rows to 0: nothing repeats, but the page still reads 500 rows. Now set the page size to 20 and the new rows to 20: 180 repeats, so every page after the first is exactly the previous page again, and a client looping until it sees a short page would never finish on a feed that busy. Switch to Cursor: 0 repeats at any insert rate. Deletes do the opposite to offset paging, pulling rows up past the page boundary so the client silently skips them; the widget does not model that, but the cursor fixes it too.',
    ],
  },
  concepts: [
    {
      title: 'Resources, verbs and their guarantees',
      body: 'Model the API as nouns and let HTTP methods carry the verb: `GET /orders/42`, `POST /orders` to create, `PATCH /orders/42` to change fields, `DELETE /orders/42`. The methods make promises clients and proxies rely on. GET and HEAD are safe (no side effects), so they can be cached and prefetched; PUT and DELETE are idempotent, so sending the same request twice leaves the same state as sending it once; POST is neither, and PATCH is not guaranteed to be. Actions that do not fit a field update become resources of their own, such as `POST /refunds` with the payment id in the body, which also gives the action an id, a status and a history. Keep nesting shallow: `/orders/42/items` is clear, four levels deep is not.',
    },
    {
      title: 'Pagination: offset versus cursor',
      body: 'Offset pagination (`LIMIT 50 OFFSET 40000`) is simple and allows "jump to page 37", but the database still walks and discards every skipped row, so deep pages get slower in proportion to their depth, and rows inserted or deleted between requests shift the window, repeating or skipping items. Cursor (keyset) pagination remembers where the last page ended and asks for rows after it: ordered by created_at descending, then id descending, the next page is `WHERE (ts, id) < (?, ?)` with an index on the same columns, one seek plus the page, at any depth. The sort key must be unique, so add the id as a tie breaker; otherwise rows sharing a timestamp at a page boundary are skipped or repeated. Return the cursor as an opaque token (for example, base64 of the last key and the filters, signed) so clients cannot build or edit it and the server can change its format. The price: no random page access, and totals become expensive or approximate.',
    },
    {
      title: 'Idempotency keys for safe retries',
      body: 'A client whose POST times out cannot tell whether the server never got it or committed it and lost the response, and retrying blindly can create a second order or a second charge. With an idempotency key, the client generates a unique id (a UUID) per logical operation, sends it in an `Idempotency-Key` header, and reuses it on every retry. The server stores the key with a hash of the request and the response it returned, under a unique constraint: a repeat returns the stored response, a concurrent repeat still in progress gets 409, and the same key with a different body is rejected (the IETF draft suggests 422). Keys expire after a day or so (Stripe keeps them at least 24 hours). The server must pass the operation on downstream idempotently too, for example with the same key to the card processor.',
    },
    {
      title: 'Status codes, error bodies and rate limits',
      body: 'Status codes tell a client whether to fix the request or try again. 4xx means the request is wrong and repeating it will not help: 400 malformed, 401 not authenticated, 403 not allowed, 404 not found, 409 conflict with current state (a duplicate, a version mismatch), 412 when an `If-Match` precondition fails, 422 for input that parses but fails validation. 5xx means the server failed and a retry may succeed: 500 for an application error, 502 and 504 from gateways and proxies, 503 when overloaded. 429 means too many requests, sent by the rate limiter at the API edge (per API key or user, often a token bucket) with `Retry-After` in seconds; quotas over a day or month use the same code. Clients retry only 5xx, 429 and network errors, with exponential backoff and jitter, and only for idempotent requests or ones carrying a key. Error bodies should be machine readable: RFC 9457 problem details give a type, title, status, detail and instance, plus field errors and a request id for support. Never return 200 with an error inside.',
    },
    {
      title: 'Versioning and backward compatibility',
      body: 'Once clients ship, most changes must be additive: new endpoints, new optional request fields, new response fields. That only works if clients ignore fields they do not know, so say so in the contract. Breaking changes include removing or renaming a field, changing its type or meaning, making an input required, and tightening validation; adding an enum value breaks clients that switch over the values without a default. When a break is unavoidable, add a new version beside the old one, in the path (`/v2/orders`) or a header; Stripe pins each account to a dated version and translates responses for older ones. Retire a version deliberately: announce it, send `Deprecation` and `Sunset` headers, measure remaining traffic per client, and switch it off only when that traffic is near zero. Mobile apps stay installed for years, so their versions live longest.',
    },
    {
      title: 'REST, gRPC and GraphQL, and the N+1 problem',
      body: 'REST over JSON is universal: every language and browser speaks it, HTTP caches and CDNs understand GET, and it suits public APIs. gRPC sends protobuf over HTTP/2 with a typed contract and generated clients: compact, fast, with streaming in both directions, and schema rules that make additive changes safe; browsers need gRPC-Web or a similar proxy, so it fits internal service-to-service calls best. GraphQL lets each client ask for exactly the fields and nested objects it needs in one round trip, which suits many screens on slow mobile links, but everything goes to one endpoint (usually POST), so HTTP caching is lost unless queries are persisted, and one query can be arbitrarily expensive, so servers limit depth and cost. All three hit N+1: listing 50 orders, then fetching each customer separately, is 51 calls. Fix it with batch endpoints (`GET /customers?ids=`), an expand option that embeds related objects, or in GraphQL a DataLoader that collects the lookups of one request into one batched query.',
    },
    {
      title: 'Webhooks: signed, retried, deduplicated',
      body: 'A webhook is the server calling the client: an HTTPS POST to a URL the customer registered, instead of the customer polling. Delivery is at least once and not in order: the sender retries failed deliveries with exponential backoff for days (Stripe retries for up to 3 days), so receivers must dedupe by event id and treat events as hints, fetching current state or comparing object versions rather than trusting arrival order. The sender signs each delivery with HMAC-SHA256 over a timestamp and the raw body using a per-endpoint secret; the receiver recomputes it over the raw bytes, compares in constant time, and rejects timestamps older than a few minutes to stop replays. Receivers should return 2xx fast and do the work from a queue, since a slow handler looks like a failure and triggers retries. Keep a queue per endpoint so one dead customer does not delay everyone else.',
    },
  ],
  examples: [
    {
      title: 'Paginate an order history',
      problem:
        "A marketplace API lists a seller's orders newest first, 50 per page. Large sellers have 40,000 orders and receive about 3 new orders between two page requests; an export job walks every page. The current endpoint uses `LIMIT 50 OFFSET n` and deep pages take seconds. Redesign it.",
      insight:
        'Page by position in an index, not by counting rows from the top: a unique sort key and an opaque cursor make every page cost the same and survive inserts.',
      steps: [
        'Offset cost: page 800 reads 800 times 50 = 40,000 rows to return 50. The export reads pages 1 to 800, which is 50 times 800 times 801 / 2, about 16 million rows, and with 3 inserts per page turn it receives 3 times 799 = 2,397 duplicates, while any deletions make it skip orders it never sees.',
        'Sort by created_at descending, then id descending, since a bulk import can give hundreds of orders the same timestamp and a timestamp alone would skip or repeat them at page boundaries. Add an index on (seller_id, created_at DESC, id DESC).',
        "Each page returns the orders plus next_cursor, an opaque token holding the last row's created_at and id and a hash of the filters, signed so a client cannot forge one. The next request filters `WHERE (ts, id) < (?, ?)` on those values: one index seek plus 50 rows, 51 reads at any depth, and 800 times 51 = 40,800 for the whole export, about 390 times fewer.",
        'New orders land before the cursor, so the export never sees them twice; it picks them up on its next run by paging from the top until it reaches an order it already has. A deleted order does not break the cursor either, since the cursor holds key values, not a row reference.',
        'Drop "page 37 of 800" and the exact total: counting 40,000 rows on each request costs more than the page. Return has_more, or an approximate total from table statistics if the UI needs one.',
      ],
    },
    {
      title: 'Make a payment endpoint safe to retry',
      problem:
        'A mobile app sends 1 million payments a day through `POST /payments`. About 0.5% of requests time out on the client, and for about half of those the server had already charged the card. The app retries every timeout. How many customers are charged twice today, and how do you fix it?',
      insight:
        'A retry is only safe if the server can recognize it: give each logical payment a key that every attempt reuses, and store the outcome under that key.',
      steps: [
        'Timeouts: 0.5% of 1 million is 5,000 a day; half had succeeded, so blind retries charge 2,500 customers twice every day.',
        'The app generates a UUID when the user taps Pay, stores it with the pending payment, and sends it as the `Idempotency-Key` on the first attempt and on every retry, including after an app restart. A new key per attempt would defeat the point.',
        'The server inserts (account, key, request hash, status processing) under a unique constraint before charging. A retry that finds a completed row gets the stored status code and body; one that finds processing gets 409 and tries again later; a different body under the same key is rejected.',
        'The server calls the card processor with the same key, so a crash between charging and recording the result is also safe to retry. The client retries only timeouts, 5xx and 429, backing off 1, 2 and 4 seconds with jitter and honoring `Retry-After`.',
        'Storage is small: 1 million keys a day with a stored response of about 1 KB each is about 1 GB, kept for 24 hours and then deleted by a TTL job.',
      ],
    },
    {
      title: 'Deliver webhooks to 20,000 merchants',
      problem:
        'A payments platform sends 5 million events a day to 20,000 merchant endpoints. One merchant receives 250 events an hour and its endpoint is down for 6 hours. Design delivery so that merchant gets every event, nobody else is delayed, and nobody can forge an event.',
      insight:
        'Treat each endpoint as its own retrying queue, sign every delivery, and make receivers idempotent, because at-least-once delivery will send duplicates.',
      steps: [
        'Events go to a durable log first, then into a delivery queue per endpoint. At 5 million a day, about 58 a second on average, the platform is light; the risk is one slow endpoint holding workers, so each delivery has a short timeout (say 10 seconds) and a per-endpoint concurrency cap.',
        "Failed deliveries retry with backoff doubling from 1 minute and capped at 1 hour: attempts at 1, 3, 7, 15, 31 and 63 minutes, then hourly, giving up after 3 days. During the 6-hour outage the merchant's queue grows to 250 times 6 = 1,500 events.",
        'When the endpoint recovers, the next successful delivery releases the backlog at the concurrency cap (say 10 at a time) rather than all 1,500 at once, which would knock the merchant over again.',
        "Each delivery carries a header with a timestamp and HMAC-SHA256 of the timestamp and raw body under the endpoint's secret. The merchant rejects bad signatures and timestamps older than 5 minutes. To rotate a secret, sign with old and new secrets for a day so the merchant can switch without dropping events.",
        "Every event has an id, and the merchant stores processed ids and skips repeats. Since retries reorder events, each carries the object's version, or the merchant fetches the object's current state before acting.",
      ],
    },
  ],
  pitfalls: [
    'Offset pagination on a large, busy table: deep pages read every skipped row, and inserts and deletes between requests make clients see items twice or miss them.',
    'Paging by a non-unique sort key such as created_at alone: rows that share a value at a page boundary are skipped or repeated, so always add the id as a tie breaker.',
    'Retrying a POST without an idempotency key, or generating a fresh key for each retry: every timeout that had actually succeeded becomes a duplicate order or charge.',
    'Returning 200 with an error in the body, 500 for bad input, or 429 without `Retry-After`: clients cannot tell what to fix, retry logic retries what it should not, and throttled clients hammer the API.',
    'Renaming or removing a field in place because "nobody uses it": old mobile builds and partner integrations break at once; add the new field, deprecate the old one and measure traffic before removing it.',
  ],
  followUps: [
    {
      question: 'Product insists on "page 37 of 120" with jump-to-page links. What do you do?',
      answer:
        'Keep offset pagination only where the set is small and bounded, such as an admin table of a few thousand rows, and show an approximate total. For large sets, cap the depth: Elasticsearch refuses results past 10,000 by default (`max_result_window`) and offers `search_after`, a cursor, for going deeper. Most users refine the filter rather than jump to page 37, so a better search usually beats deep pages.',
    },
    {
      question: 'Is PATCH idempotent? How do you stop two clients overwriting each other?',
      answer:
        'A PATCH that sets fields to values, like a JSON merge patch, has the same effect when repeated, but the method does not promise it: an increment or an "append to list" operation is not idempotent. Lost updates are a separate problem: return an ETag with each read and require `If-Match` on writes; if the resource changed since the client read it, the server answers 412 and the client re-reads and merges instead of silently overwriting.',
    },
    {
      question: 'Would you expose gRPC as your public API?',
      answer:
        'Usually not as the only option. Public clients expect JSON over HTTP, browsers cannot speak native gRPC without a proxy, and HTTP caches and API gateways understand REST best. A common split is gRPC between internal services for typed contracts and speed, and a REST or GraphQL layer at the edge, sometimes generated from the same protobuf definitions with a transcoding gateway.',
    },
  ],
};
