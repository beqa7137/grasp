import type { CaseStudy } from './types.js';

export const FILE_SYNC: CaseStudy = {
  id: 'file-sync',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt:
        '"Like Dropbox or Google Drive" covers sync clients, a web app, sharing, previews, search and collaborative documents. Which questions shape the design, and what do you park?',
      decision: {
        question: 'You have time for one question first. Which answer changes the design the most?',
        options: [
          {
            label: 'Do people edit the same file at the same time, live, or is it whole files edited on one device at a time and synced?',
            best: true,
            why: 'Live co-editing (like Google Docs) sends every keystroke as an operation and merges them with operational transforms or CRDTs, which is a different system. File sync moves whole file versions, can treat a file as opaque bytes, and handles the rare concurrent edit as a conflict.',
          },
          {
            label: 'How many users are there, and how much does each store?',
            why: 'You will ask it next, since it sizes the storage and the metadata tier. The shape (blocks in a blob store, metadata in a database, a change journal) is the same at any size.',
          },
          {
            label: 'What is the largest file a user can upload?',
            why: 'Chunking makes size mostly irrelevant: a 50 GB file is just more blocks. It changes a limit in the client, not the architecture.',
          },
          {
            label: 'Which operating systems must the desktop client support?',
            why: 'It matters for the client team (file system watchers differ per platform), but the server side is the same for every client.',
          },
        ],
      },
      points: [
        'Functional: upload, download and delete files and folders; changes made on one device appear on the other devices of that user; share a folder with other users, or a file through a link; restore earlier versions.',
        'Whole-file sync, not live co-editing (from the interviewer). Out of scope unless asked: document editing in the browser, full-text search, previews and thumbnails, and billing.',
        'Scale (from the interviewer): 500 million users storing about 10 GB each, 100 million of them active on a given day, most with two or three devices.',
        'Non-functional: never lose or corrupt a file once the upload is acknowledged (durability comes first); a change reaches other online devices within seconds; large files survive flaky networks.',
        'Consistency: the metadata for one folder tree must be strongly consistent, so two devices never see different histories of it; propagation to devices can lag by seconds.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the storage',
      prompt:
        '500 million users store 10 GB each. Deduplication removes about a fifth of the blocks, and the blob store keeps data with erasure coding at 1.5 times its size. How much raw disk does that need?',
      estimate: {
        question: 'Raw disk for the blob store',
        answer: 6,
        unit: 'EB',
        working: [
          'Logical data: 500 million users times 10 GB is 5 billion GB, which is 5 EB.',
          'Deduplication removes about 20%: 5 EB times 0.8 is 4 EB of unique blocks.',
          'Erasure coding at 1.5 times (for example 6 data fragments plus 3 parity): 4 EB times 1.5 is 6 EB on disk.',
          'Three full replicas would need 12 EB instead, so erasure coding saves about 6 EB of disks.',
        ],
      },
      points: [
        'Growth: 100 million daily users adding about 20 MB of new data a day is 2 PB a day, about 730 PB a year, and about 23 GB/s (185 Gbps) of average upload.',
        'Blocks: 4 EB of unique data in 4 MB blocks is about 1 trillion blocks. At about 100 bytes per block record (a 32-byte hash, its location and a reference count) the block index is about 100 TB.',
        'Metadata calls: 100 million daily users times about 50 calls (change checks, listings, commits, block lookups) is 5 billion a day, about 58,000 a second on average and about 116,000 at peak.',
        'The shape: bytes are huge, cold and immutable; metadata is small by comparison but touched by every sync. They belong in different stores.',
      ],
    },
    {
      kind: 'api',
      title: 'Upload only what is new',
      prompt:
        'A user edits one slide in a 300 MB presentation and saves. How does the client get the change to the server without sending 300 MB, and what does the server need to commit it?',
      decision: {
        question: 'How does an upload travel?',
        options: [
          {
            label:
              'The client splits the file into blocks and hashes each one, asks which hashes the server lacks, uploads only those to block storage, then commits the file as an ordered list of hashes',
            best: true,
            why: 'An edited slide changes a few blocks, so only those travel. Blocks already stored (by this user or anyone) are never sent again, a dropped connection costs one block, and the commit is a small metadata write that either succeeds or reports a conflict.',
          },
          {
            label: 'A resumable multipart upload of the whole file to object storage, as one object per version',
            why: 'Defensible for a simple product: resumable, and the bytes bypass the API servers. But every save re-sends the whole file, every version stores it again, and identical files across users are stored many times.',
          },
          {
            label: 'Send the whole file to the API servers, which compute the difference against the stored copy',
            why: 'The bytes still cross the network in full, so the upload is no smaller, and the servers spend CPU reading the old copy to diff it. The client already has both versions and should do this work.',
          },
        ],
      },
      points: [
        '`POST /blocks/check` with a list of hashes returns the ones the server does not have. `PUT /blocks/{hash}` uploads one block; the server recomputes the hash and rejects a mismatch, so a block can never be stored under the wrong name.',
        '`POST /files/commit` names the path, the ordered block hashes, the size and the parent version the edit started from. It succeeds with a new version, or returns `409` with the current version if someone else committed first.',
        'Uploads can also go straight to the blob store through short-lived pre-signed URLs per block, keeping the heavy bytes off the API fleet.',
        '`GET /changes?cursor=` returns everything that changed in the folders of the user since the cursor, plus a new cursor. A long-poll call waits until something changes, so idle devices cost almost nothing.',
        'Downloads: the client learns the block list from the metadata, fetches only blocks it does not already hold locally, and rebuilds the file.',
      ],
    },
    {
      kind: 'data',
      title: 'Split metadata from blobs',
      prompt:
        'You have a trillion immutable blocks and hundreds of billions of small, constantly changing file records. Where does each live?',
      decision: {
        question: 'How do you store files and their metadata?',
        options: [
          {
            label:
              'Metadata (namespaces, files, versions, block lists) in a sharded relational database keyed by namespace; blocks in a content-addressed blob store keyed by hash',
            best: true,
            why: 'Each store does what it is good at: transactions and indexes for a folder tree that must stay consistent, and cheap, durable, erasure-coded storage for immutable bytes. Keying blocks by hash gives deduplication and integrity checks for free.',
          },
          {
            label: 'Everything in object storage: one object per file, with the folder path as the object key',
            why: 'Durable and simple, but a folder rename rewrites every key under it, there is no transaction across objects, and there is no change journal to sync from, so devices would have to list and compare.',
          },
          {
            label: 'File contents as blobs inside the database rows',
            why: 'Exabytes of bytes in a transactional database make every backup, replica and migration enormous and expensive, and pay for indexes and write-ahead logs that immutable data never needs.',
          },
          {
            label: 'A shared network file system (NFS) mounted on the API servers',
            why: 'Fine for one office, but a single file system does not scale to exabytes or billions of users, and it has no notion of versions, sharing or per-device sync state.',
          },
        ],
      },
      points: [
        'A namespace is a folder tree with its own history: each user has a root namespace, and each shared folder is its own namespace mounted into the tree of every member.',
        'Tables: `namespaces`, `files` (namespace, path, latest version), `versions` (file, version, size, ordered block hashes, author device) and an append-only `journal` per namespace with a gapless sequence number.',
        'Shard the metadata by namespace ID, so every commit and every change query for one folder tree is a single-shard transaction. A very large team namespace can get a shard of its own.',
        'The block index maps a hash to its location in the blob store and a reference count; it is sharded by hash, which spreads writes evenly.',
        'The blob store groups blocks into large immutable extents (hundreds of MB to a few GB), erasure coded across disks and zones. Dropbox built its own, Magic Pocket, and moved off Amazon S3 for most data in 2016.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt:
        'Trace one save on a laptop until the phone shows the new version. Which calls are on the request path, and what happens in the background?',
      lab: true,
      points: [
        'The laptop client notices the change, splits and hashes the file, calls `POST /blocks/check`, uploads the missing blocks to the blob store, then commits the new block list against its parent version.',
        'The commit is one transaction on the namespace shard: insert the version, update the file row and append a journal entry with the next sequence number. Block references are counted in the same flow, so a new version never points at a missing block.',
        'After the commit, a change event notifies the other devices watching that namespace: their long-poll calls return, each calls `GET /changes` from its cursor, and downloads only the blocks it lacks.',
        'Block downloads go through a CDN: a block is immutable and named by its hash, so it caches forever, and the app hands out signed URLs so the edge checks access without asking the origin.',
        'Open the build in the Lab: one of two regions at peak, about 60,000 requests a second, 90% reads. The CDN answers the block downloads it holds (about 30%), the cache holds hot namespace metadata and cursors, and the sharded database is the metadata store with replicas for listings. Commits are drawn on the synchronous path, since a device must learn at once whether it won; the notification fan-out, thumbnails and garbage collection hang off the journal in the background, and the blob store is off to the side (the simulator counts requests, not bytes).',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Chunk and deduplicate',
      prompt:
        'A user inserts a paragraph near the start of a 200 MB file. With 4 MB blocks cut at fixed offsets, every block after the insertion shifts. How do you keep the upload small, and how far should deduplication reach?',
      decision: {
        question: 'How do you cut files into blocks?',
        options: [
          {
            label: 'Content-defined chunking: a rolling hash picks boundaries where the content matches a pattern, averaging about 4 MB',
            best: true,
            why: 'Boundaries follow the content, so an insertion changes only the block it lands in and perhaps its neighbor; everything after it hashes the same as before. Algorithms such as Rabin fingerprints or FastCDC are fast enough to run on the client.',
          },
          {
            label: 'Fixed 4 MB blocks at fixed offsets',
            why: 'Simple, and good for files edited in place (databases, disk images) or appended to. An insertion near the start shifts every later block, so without an extra delta protocol on top the whole tail is uploaded again.',
          },
          {
            label: 'One hash per whole file',
            why: 'Deduplicates identical files, but any edit re-uploads everything, and a large upload cannot resume from a known point.',
          },
        ],
      },
      points: [
        'Hash blocks with a strong cryptographic hash such as SHA-256, so two different blocks never collide in practice and the hash doubles as an integrity check on every read.',
        'Deduplication across all users saves the most, but it leaks information: if uploading a hash is instantly accepted, the uploader learns someone already stores that file. Limiting it to one user or one team closes the leak for a smaller saving.',
        'If users can bring their own keys or want end-to-end encryption, the server can no longer see equal content, so cross-user deduplication is off for those files.',
        'Garbage collection: a block is deletable only when no version references it. Reference counts are updated with commits and version expiry, and a periodic mark-and-sweep over the metadata catches counts that drifted, with a grace period so a block uploaded moments before its commit is not swept.',
        'Small files (most files are small) waste space as separate blocks; pack them into shared extents in the blob store, and compress blocks before upload when it helps.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Sync and conflicts',
      prompt:
        'A user edits a file on a laptop on a plane, and a colleague edits the same shared file at the office. The laptop lands and syncs. What happens, and how do all devices converge?',
      decision: {
        question: 'Two devices edited the same file from the same version. How do you resolve it?',
        options: [
          {
            label:
              'Each commit names the parent version it edited; the first to commit wins, and the second device keeps its edit as a separate conflicted copy beside the file',
            best: true,
            why: 'No edit is ever silently lost, and the rule needs no clocks: the database decides who was first. The user merges the two copies by hand, which is the only safe merge for opaque formats. Dropbox names the copy with the device owner and the date.',
          },
          {
            label: 'Last writer wins, by the timestamp of each edit',
            why: 'Device clocks drift and can be set by hand, and whichever edit loses vanishes without a trace. Silent data loss breaks the first requirement.',
          },
          {
            label: 'Lock the file while someone has it open',
            why: 'An offline laptop cannot take or release a lock, and a lock held by a crashed device blocks everyone. Some team products offer optional locks, but they cannot be the sync model.',
          },
          {
            label: 'Merge the two versions automatically',
            why: 'Possible for plain text, but most files are binary formats (documents, images, archives) where a byte-level merge produces a corrupt file.',
          },
        ],
      },
      points: [
        'The journal is the source of truth for sync: each namespace has a gapless, increasing sequence of changes (add, edit, move, delete), and a device cursor is simply the last sequence number it applied, per namespace.',
        'The commit is a conditional write: `WHERE version = ?` on the file row. If no row changes, someone else committed first, and the server returns the winner so the client can download it and save its own edit as the conflicted copy.',
        'Deletes and moves are journal entries too (a delete is a tombstone), so an offline device learns about them in order; old versions stay restorable for a retention period.',
        'Notifications are only hints: a device that misses one catches up from its cursor on the next poll, so a lost message delays sync but never corrupts it.',
        'Sharing: adding a member mounts the shared namespace in their tree and gives their devices a cursor for it from zero; removing them unmounts it. Permissions live on the namespace, so they are checked once per request, not once per file.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'You have five minutes left. What would you raise before the interviewer does?',
      points: [
        'Durability: acknowledge an upload only after the block is erasure coded across zones, verify block hashes on read and in background scrubbing, and keep a copy in a second region for disasters.',
        'Shared links: a signed URL through the CDN, revocable by rotating the link, with rate limits so a leaked link cannot become free hosting.',
        'Client efficiency: a local database of files, hashes and cursors, so the client rescans only what the file system watcher reports, and throttles bandwidth when the user is on a metered network.',
        'Monitoring: commit latency and conflict rate, notification delay from commit to other devices, blob store repair backlog, and garbage collection lag (space held by unreferenced blocks).',
      ],
    },
  ],
  pitfalls: [
    'Storing file bytes in the metadata database, or storing metadata only as object keys with no journal to sync from.',
    'Resolving conflicts by timestamp, so one device silently overwrites another.',
    'Re-uploading whole files on every save, or chunking at fixed offsets and then assuming insertions upload only one block.',
    'Treating notifications as the sync protocol instead of a hint, so a missed message leaves a device stale forever.',
    'Deleting a block as soon as one file stops using it, without reference counts or a grace period.',
  ],
  followUps: [
    {
      question: 'A user restores a folder of 100,000 files to how it looked last Tuesday. How do you do it quickly?',
      answer:
        'Walk the journal back to the last sequence number before Tuesday and compute each file state at that point. Every old version still references its blocks, so the restore writes new versions and journal entries that point at existing blocks, without moving any bytes; batch them in large transactions on the namespace shard.',
    },
    {
      question: 'How would you add the ability to preview and search files?',
      answer:
        'Consume the journal in the background: a worker downloads each new version, extracts text and renders previews, and writes them to a search index and a preview store keyed by version. It never blocks a commit, and a rebuild is just a replay of the journal.',
    },
    {
      question: 'How do you move a 1 TB camera folder onto a new laptop without waiting days?',
      answer:
        'Download in parallel from the nearest CDN edge, starting with the files the user opens, and offer on-demand files: the client shows placeholders and fetches content only when a file is opened, which is how modern desktop clients avoid filling the disk.',
    },
  ],
};
