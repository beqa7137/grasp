import type { CaseStudy } from './types.js';

export const COLLABORATIVE_EDITOR: CaseStudy = {
  id: 'collaborative-editor',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt:
        'Five people type into the same paragraph at once, one of them on a train that keeps losing signal. Everyone must end up reading the same text. Which requirements shape the design, and what do you promise about each keystroke?',
      decision: {
        question: 'What do you promise about concurrent edits?',
        options: [
          {
            label:
              'Your own keystrokes appear at once, others appear within a fraction of a second, every copy converges to the same text, and an acknowledged edit is never lost',
            best: true,
            why: 'Typing must never wait for a network round trip, so each client applies its own edits locally and reconciles later. Convergence and durability are the parts users can check, so those are the guarantees; the exact order of two concurrent keystrokes is not something anyone can see.',
          },
          {
            label: 'Every keystroke is applied in one global order before it appears on any screen, including the author',
            why: 'Correct and easy to reason about, but every character waits for a round trip to the server: 100 to 200 ms per key from another continent, which feels broken while typing.',
          },
          {
            label: 'Save the whole document on each change and let the last save win',
            why: 'Fine for a settings page, but two people typing in different paragraphs overwrite each other every few seconds, which is exactly what a collaborative editor exists to prevent.',
          },
        ],
      },
      points: [
        'Functional: create and open rich text documents, edit them together in real time, see who else is there and where their cursors are, keep editing offline and merge on reconnect, browse and restore version history, and share with viewer, commenter or editor access.',
        'Scale (from the interviewer): 500 million documents stored, about 6 million clients with a document open at the evening peak across about 4 million open documents. Most documents have one editor; a few have dozens.',
        'Non-functional: local echo with no waiting, remote edits visible in well under a second, convergence, no acknowledged edit ever lost, and opening a document in about a second.',
        'Out of scope unless asked: spreadsheets and drawings, comments and suggestions as their own feature, search across documents, and export to other formats.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the edit stream',
      prompt:
        'A typing client sends a small batch of operations every 100 ms or so, but most open tabs sit idle or are only being read. If 6 million clients average one batch every 3 seconds, how many batches arrive per second?',
      estimate: {
        question: 'Operation batches per second at peak',
        answer: 2_000_000,
        unit: 'batches/s',
        working: [
          '6,000,000 connected clients, one batch every 3 seconds on average.',
          '6,000,000 / 3 is 2,000,000 batches per second.',
          'Each batch must be ordered, stored durably and sent to the other people in that document.',
        ],
      },
      points: [
        'Two million small writes a second is too many for any single store, but it is spread over about 4 million documents, and the ordering problem is per document, never global.',
        'Connections: 6 million WebSockets, mostly idle. A gateway server that holds 50,000 open sockets needs 6,000,000 / 50,000, about 120 of them, plus headroom for reconnect storms.',
        'Cursor and presence updates are at least as frequent as edits, but they are throttled, never stored and only relayed, so they cost bandwidth and CPU, not storage.',
        'Fan-out is small on average (4 million documents for 6 million clients) but skewed: a document with 50 editors turns each batch into 49 outbound messages.',
      ],
    },
    {
      kind: 'api',
      title: 'A live channel per document',
      prompt:
        'The editor needs edits pushed to it the moment someone else types, and it sends a burst of tiny messages while its user types. Which transport carries the edit stream, and what does each message say?',
      decision: {
        question: 'How do clients exchange edits with the server?',
        options: [
          {
            label: 'A WebSocket per open document to the session server that owns it, with plain HTTP for everything else',
            best: true,
            why: 'One long-lived, ordered, two-way channel suits a stream of small messages in both directions, and it lands on the one server that orders the document. Creating, listing, sharing and history are ordinary request and response calls that cache and retry well over HTTP.',
          },
          {
            label: 'Server-sent events for incoming edits, and an HTTP POST for each outgoing batch',
            why: 'Workable, and it passes proxies that break WebSockets. But each POST can reach a different server and arrive out of order, so the client must sequence its own sends, and every batch pays request overhead.',
          },
          {
            label: 'Poll for changes every second, and POST each batch',
            why: 'Simple, but a second of delay makes two cursors fight over the same word, and 6 million clients polling every second is 6 million requests a second, almost all returning nothing.',
          },
        ],
      },
      points: [
        '`POST /docs` creates a document; `GET /docs/{id}` returns metadata, your role and the latest snapshot with its revision number.',
        'The client then opens a WebSocket to `/docs/{id}/live`, sending the revision it holds. The server replies with any operations after that revision, then streams new ones.',
        'Each outgoing message carries a batch of operations, the base revision it was written against, and a client ID with a sequence number, so a batch resent after a reconnect is recognized and not applied twice.',
        'The server answers the author with an acknowledgement naming the revision the batch became, and sends the transformed batch to everyone else. Cursor positions travel as separate presence messages that are never stored.',
        '`GET /docs/{id}/history` lists versions; `POST /docs/{id}/share` changes access. Every call and the socket itself check the caller role.',
      ],
    },
    {
      kind: 'data',
      title: 'Merge concurrent edits',
      prompt:
        'Ana deletes the character at position 2 while Ben inserts "x" at position 5, both against revision 40. The server gets Ana first. Where does "x" go, and which technique decides that for every pair of edits?',
      decision: {
        question: 'With one session server ordering each document, how do you merge concurrent edits?',
        options: [
          {
            label: 'Operational transformation: the server orders operations and transforms each incoming one against those it missed',
            best: true,
            why: 'The session server already gives every document one order, so transforms only happen between a client and the server, which avoids the hard cases of peer-to-peer transformation. The stored document stays plain text and formatting with no per-character metadata, and the server can validate and permission-check each operation. Google Docs uses operational transformation with a central server, the approach of the Jupiter system from 1995.',
          },
          {
            label: 'A sequence CRDT such as Yjs or Automerge: every character gets a unique ID, and replicas merge in any order',
            why: 'A strong choice, and the better one for offline-first or peer-to-peer editing, since any two replicas merge without a server. Here a server orders everything anyway, so that advantage goes mostly unused while the costs remain: per-character IDs, and metadata kept for deleted text so late edits can still find their place.',
          },
          {
            label: 'Lock a paragraph while someone edits it',
            why: 'No merging needed, but two people cannot fix typos in the same paragraph, locks leak when a laptop sleeps, and taking a lock costs the round trip that local echo was meant to avoid.',
          },
          {
            label: 'Last writer wins per paragraph',
            why: 'Cheap and fine for fields such as a title or a color, as design tools do per property. For prose, two people typing in one paragraph silently lose one person entirely.',
          },
        ],
      },
      points: [
        'Operations are small: retain n characters, insert text with attributes, delete n characters, or change formatting over a range. A batch is a list of them against a base revision.',
        'Ana first becomes revision 41. Ben wrote against 40, so the server transforms his insert against her delete: the delete was before position 5, so "x" moves to position 4, becomes revision 42 and goes to everyone.',
        'Each client has at most one batch awaiting acknowledgement and buffers the rest. Incoming operations are transformed against the pending and buffered ones before they are applied, so the client never needs anything but its own queue and the server stream.',
        'Storage: an operation log keyed by `(doc_id, revision)`, about 100 bytes a batch; periodic snapshots of the full document in object storage; and a metadata table (owner, title, latest snapshot revision, home region) with an access table of document, principal and role.',
        'Opening a document reads the latest snapshot plus the operations after it, so the log never has to be replayed from the start.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt:
        'Trace a keystroke from Ana to Ben: which server orders it, where it becomes durable, and what serves a document that nobody has open?',
      lab: true,
      points: [
        'Clients connect through a load balancer to a gateway that terminates WebSockets, checks the session and access, then looks up which session server owns the document and relays to it.',
        'The session server holds each open document in memory with its recent operation history. It transforms an incoming batch, appends it to the operation log with the next revision, and only then acknowledges the author and broadcasts to the others.',
        'The operation log is sharded by document ID, so all of one document is on one shard and an append is a single-shard write. Snapshot workers (not in the build) read the log and write a new snapshot every thousand operations or so, and when a document goes idle.',
        'Presence and cursors live only in the session server memory and are relayed, throttled to about ten updates a second per client. When a document closes, its session ends and its memory is freed; the 500 million cold documents cost only storage.',
        'Open the build in the Lab: one two-hundredth of the fleet, 10,500 requests a second: 10,000 batch appends plus 500 document opens and history reads. The app servers stand for the gateways and session servers, the cache for recent snapshots and the database for the operation log and metadata, sharded by document ID. Relayed presence traffic is left out.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'One owner per document',
      prompt:
        'Ordering only works if exactly one session server owns a document at a time. A session server stalls in a long pause, the system gives its documents to another server, and then the first one wakes up. What stops two servers from writing two different revision 42s?',
      decision: {
        question: 'How do you make sure one document has one owner?',
        options: [
          {
            label:
              'Assign documents through a lease in a coordination service, and make every log append conditional on the revision not existing yet',
            best: true,
            why: 'The lease gives a normal owner and routes clients to it. The conditional append is the fence: each append also checks the document lease epoch, which the new owner raises on takeover, so a paused old owner that wakes and tries to write fails at once, learns it lost the document and drops its sessions. Correctness never depends on clocks or on the lease being perfect.',
          },
          {
            label: 'Consistent hashing of the document ID over the live session servers',
            why: 'A good way to spread documents, and a fine input to the assignment. On its own it has no fence: while servers join or leave, gateways with different membership views send one document to two servers, which then fork its history.',
          },
          {
            label: 'Any session server handles any batch, taking a Redis lock per document for each append',
            why: 'Removes the owner, but every batch now pays a lock round trip and a read of recent history, the in-memory state that makes transforms cheap is gone, and a lock that expires during a pause admits a second writer anyway.',
          },
        ],
      },
      points: [
        'The directory maps a document to its owner and a lease epoch, held in something like etcd or ZooKeeper. Gateways cache the mapping and refresh it when a session server answers "not mine".',
        'The log append is an insert on the primary key `(doc_id, revision)` that fails if the row exists. That one check makes a forked history impossible, even with two servers that both believe they own the document.',
        'On failover the new owner loads the snapshot and the log tail, clients reconnect with their last revision and resend unacknowledged batches, and the client ID and sequence number stop a batch that was stored just before the crash from being applied twice.',
        'Hot documents: an all-hands agenda with 300 people open is one document on one server. Cap simultaneous editors (say at 100) and serve the rest as read-only viewers through a relay tier that fans out the committed stream.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Offline edits, snapshots and history',
      prompt:
        'Ben edits for two hours on a train while the others keep typing. When he reconnects, how does his work merge? And how much history do you keep for 500 million documents?',
      estimate: {
        question: 'Operation log written per day, before compression',
        answer: 8.64,
        unit: 'TB',
        working: [
          'Across the day the rate averages about half the peak: 1,000,000 batches a second.',
          '1,000,000 x 86,400 seconds is 86.4 billion batches a day.',
          '86.4 billion x 100 bytes is 8.64 TB a day, over 3 PB a year if kept forever.',
        ],
      },
      points: [
        'Offline, the client keeps applying edits locally and stores the pending operations and their base revision on the device. On reconnect it sends them; the server transforms them against everything since that revision and the client transforms the missed operations against its own, as for any late batch.',
        'Long offline stretches are where operational transformation is weakest: transforming 2 hours of edits against 2 hours of other edits is slow, and intent can drift. If offline-first is a core requirement, that is the case for a CRDT. Otherwise, past a limit, show the conflicting stretch for review or keep it as a copy rather than merging silently.',
        'The server can only transform against operations it still has, so it keeps the raw log back to at least the oldest base revision a client may send, say 30 days. Older than that, a reconnecting client gets a conflict copy.',
        'History: keep raw operations for recent edits, then thin them into snapshots at coarser steps (hourly, then daily) grouped by author. Named versions pin their snapshot. Restoring a version is a new edit that sets the document to that content, so nobody loses their place.',
        'Snapshots are also what makes opening cheap: the latest snapshot plus at most a thousand operations, cached for documents opened often.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'You have five minutes left. What would you raise before the interviewer does?',
      points: [
        'Multi-region: each document has a home region where its session server and log primary live, chosen near its most active editors and moved when they move. Remote editors pay the extra round trip, which local echo hides, and the log is replicated to a second region for disaster recovery.',
        'Access control: roles are checked on connect and on every batch, since a viewer can craft operations. Revoking access tells the session server, which closes that socket at once rather than waiting for a token to expire.',
        'Monitoring: acknowledgement latency p99, transform time, append conflicts (which should be near zero outside failovers), reconnect rates, and a convergence check that compares client document hashes with the server at the same revision.',
        'Testing: randomized tests that apply the same concurrent operations in every order and check that all replicas converge, since transform bugs appear only in rare interleavings.',
      ],
    },
  ],
  pitfalls: [
    'Waiting for the server before showing the user their own keystroke.',
    'Letting two servers order the same document with no fence on the log, so its history forks.',
    'Acknowledging or broadcasting an edit before it is durably stored.',
    'Choosing a CRDT or operational transformation by name without saying what the product needs: a central server, or offline and peer-to-peer editing.',
    'Storing only the operation log, so opening an old document replays millions of operations.',
  ],
  followUps: [
    {
      question: 'How does undo work when five people are editing?',
      answer:
        'Undo reverts only your own last change: the client keeps the inverse of each local operation and transforms it against everything that happened since, then sends it as a new operation. Undoing an edit by someone else is not what users expect.',
    },
    {
      question: 'What changes for a design tool or a spreadsheet instead of prose?',
      answer:
        'The data is a tree or grid of objects with properties rather than one long sequence, so concurrent edits rarely touch the same thing. Last writer wins per property, ordered by the server, is often enough, and Figma has described its multiplayer system this way. Text inside a cell or shape still needs sequence merging.',
    },
    {
      question: 'A viewer gets editor access while the document is open. What happens?',
      answer:
        'The sharing service updates the access table and notifies the session server that owns the document, which updates the role of that connection in memory. The client gets a message, turns on editing, and its next batch is accepted.',
    },
  ],
};
