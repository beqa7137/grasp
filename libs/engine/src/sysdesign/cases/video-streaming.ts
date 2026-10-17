import type { CaseStudy } from './types.js';

export const VIDEO_STREAMING: CaseStudy = {
  id: 'video-streaming',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt:
        '"Like YouTube" covers uploads, playback, search, comments, recommendations and live streams. Which questions shape the design, and what do you park?',
      decision: {
        question: 'You have time for one question first. Which answer changes the design the most?',
        options: [
          {
            label: 'Is this video on demand only, or live streaming too?',
            best: true,
            why: 'On demand allows a batch pipeline: upload the whole file, transcode it in minutes, then serve immutable files from caches. Live needs a real-time ingest protocol, transcoding that keeps up with the camera and segments published every few seconds, which is a different system.',
          },
          {
            label: 'How many videos are uploaded and watched a day?',
            why: 'You will ask it next, since it sizes everything. At any YouTube-like scale, though, the shape is the same (object storage, a transcoding pipeline, a CDN); the numbers change how big each piece is, not which pieces exist.',
          },
          {
            label: 'Which file formats can creators upload?',
            why: 'The transcoder normalizes anything a decoder such as FFmpeg can read into the same output ladder, so the answer changes a validation step, not the architecture.',
          },
          {
            label: 'Are comments threaded?',
            why: 'Comments are an ordinary read-heavy store beside the video path. It spends the first question on the least interesting part of the system.',
          },
        ],
      },
      points: [
        'Functional: creators upload videos (up to many GB) and set a title and visibility; viewers watch on phones, browsers and TVs, and see a title, a channel and a view count.',
        'Video on demand only (from the interviewer). Out of scope unless asked: live streaming, search, recommendations, comments, monetization.',
        'Scale (from the interviewer): 500 hours of video uploaded every minute, and 500 million daily viewers watching about 40 minutes each.',
        'Non-functional: playback starts within about 2 seconds and rarely stalls on any network; an upload survives a dropped connection; a new video is watchable within minutes.',
        'Availability beats consistency for playback and counts: a view count a few minutes stale is fine, a video that will not play is not.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the egress',
      prompt:
        '500 million viewers watch 40 minutes a day each, at an average of 3 Mbps across phones and TVs. How much bandwidth leaves the system on average?',
      estimate: {
        question: 'Average outbound video bandwidth',
        answer: 42,
        unit: 'Tbps',
        working: [
          'Minutes watched per day: 500 million times 40 is 20 billion.',
          'Average concurrent viewers: 20 billion minutes / 1,440 minutes in a day is about 13.9 million.',
          'Bandwidth: 13.9 million times 3 Mbps is about 41.7 million Mbps, so about 42 Tbps.',
          'Evening peaks run about twice the average: plan for roughly 85 Tbps.',
        ],
      },
      points: [
        'About 42 Tbps on average and about 85 Tbps at peak. No single data centre serves that; it has to come from caches spread across the world, close to viewers.',
        'Bandwidth, not compute, is the biggest bill, so every bit saved per stream (better codecs, not sending 1080p to a small phone screen) is money.',
        'Uploads are tiny next to that: 500 hours a minute at an 8 Mbps source is 500 times 3,600 seconds times 8 Mb / 60 s, about 240 Gbps.',
      ],
    },
    {
      kind: 'api',
      title: 'Upload the video',
      prompt:
        'A creator uploads a 20 GB file over a hotel connection that drops every few minutes. How do the bytes reach storage without starting over?',
      decision: {
        question: 'How does the upload travel?',
        options: [
          {
            label: 'A resumable, chunked upload straight to object storage, using pre-signed URLs per part',
            best: true,
            why: 'The API servers only hand out an upload session and short-lived URLs; the heavy bytes go directly to object storage, which is built for them. A dropped connection costs one chunk, and parts can go in parallel.',
          },
          {
            label: 'Resumable chunks sent to the API servers, which forward them to storage',
            why: 'Defensible too: the servers can inspect or checksum each chunk on the way. But every byte crosses your fleet twice, and upload servers must scale with 240 Gbps of traffic that storage could take directly.',
          },
          {
            label: 'One HTTP request carrying the whole file to the API servers',
            why: 'A connection that drops at 90% of 20 GB starts over from zero, and a server is tied up for the whole upload. It only works for small files on good networks.',
          },
        ],
      },
      points: [
        '`POST /uploads` with the size and metadata creates a video in state `uploading` and returns an upload ID, a part size (for example 16 MB) and pre-signed part URLs.',
        "The client `PUT`s parts, keeping each part's checksum or ETag; to resume, it asks which parts arrived and sends only the rest. Object stores offer this as multipart upload; the open tus protocol is another.",
        'A `complete` call on the upload assembles the object and starts the transcoding pipeline. A lifecycle rule deletes sessions abandoned for days, so half-finished uploads do not pile up.',
        'Playback: `GET /videos/{id}` returns metadata and a manifest URL on the CDN, signed for private videos; the player fetches everything else from the CDN.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt:
        'Trace two paths: a new upload becoming a playable video, and a viewer pressing play. Which parts are on the request path, and which run in the background?',
      lab: true,
      points: [
        'Upload path: client to object storage (the original), then a pipeline of queues and transcoding workers writes renditions and manifests back to object storage and marks the video `ready` in the metadata store.',
        'Playback path: the player gets metadata from the API, then pulls the manifest and segments from a CDN edge; misses go to a regional origin shield, and only its misses reach object storage.',
        'The metadata store (video, channel, status, renditions) is a sharded database keyed by video ID, with a cache in front: every play reads it once.',
        'View events flow from players to a log or queue; stream workers aggregate them and update counts in batches, never on the playback path.',
        'Open the build in the Lab: one metro at 200,000 requests a second, about 800,000 viewers each fetching a 4-second segment. The CDN answers 95%. The app tier stands for the origin and API servers, the cache for the origin shield, and the database for object storage plus the metadata store. The 1% of requests that are writes are view and watch-time events: the queue is the event log and the workers the counters. The simulator counts requests, not bytes, and the transcoding pipeline runs off this path, so it is not shown.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Transcode the upload',
      prompt:
        'A two-hour 4K upload must become a ladder of renditions from 240p to 4K, thumbnails and captions, ideally within minutes. How do you organize the work?',
      decision: {
        question: 'How do you transcode a long upload quickly?',
        options: [
          {
            label: 'Split it into chunks at keyframes and encode every chunk of every rendition in parallel, as a DAG of jobs',
            best: true,
            why: 'Hundreds of workers each encode a few seconds of video, so a two-hour film takes about as long as its slowest chunk plus the merge. A failed chunk is retried alone, and new renditions are just new branches of the graph.',
          },
          {
            label: 'One worker per rendition encodes the whole file',
            why: 'Simple and parallel across renditions, but one machine can take longer than the film itself to encode 4K, so the video stays unwatchable for hours, and a crash near the end redoes the whole rendition.',
          },
          {
            label: 'Encode at view time: transcode a segment when a player first asks for it',
            why: 'Defensible for the rarely watched tail, since most renditions of most videos are never played. As the default it puts encoding latency in front of the first viewer of every segment, and unless the output is stored and concurrent requests are coalesced, every edge that misses triggers the encode again.',
          },
        ],
      },
      points: [
        'The DAG: validate and probe the file, split at keyframes, encode each chunk per rendition, stitch and package segments and manifests, then publish. Thumbnails, audio tracks, automatic captions and copyright and safety checks are parallel branches.',
        "An orchestrator (a workflow engine) keeps each job's state in a database and puts runnable jobs on queues; stateless workers pull them, so a lost worker only means a job that times out and is retried.",
        'Make every job idempotent: its output path is derived from video, rendition and chunk, so a retry overwrites the same object and a duplicate delivery is harmless.',
        'Publish early: make the video watchable once the low renditions (for example 360p and 720p) are packaged, and add 1080p and 4K when they finish.',
        'Separate queues by priority and size, so a burst of long uploads cannot delay short ones, and the pool of cheap interruptible machines can grow with the backlog.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Stream adaptively',
      prompt:
        'A viewer on a train drops from 20 Mbps to 1 Mbps in a tunnel, then back. How does playback continue without stalling, and what did the pipeline have to produce for that?',
      decision: {
        question: 'How do players fetch the video?',
        options: [
          {
            label: 'Adaptive bitrate over HTTP: HLS or DASH, short segments in several renditions',
            best: true,
            why: 'Segments are ordinary immutable files that any CDN caches, and the player picks the rendition for each segment from its measured throughput and buffer, so quality drops in the tunnel instead of the video stopping.',
          },
          {
            label: 'Progressive download of one MP4 per resolution, chosen when playback starts',
            why: 'Defensible for a small site: simple, cacheable, and range requests allow seeking. But the choice is fixed for the whole video, so a network that gets worse means stalls, and one that gets better stays at low quality.',
          },
          {
            label: 'Stateful streaming servers pushing frames over RTMP or WebRTC',
            why: 'Built for low latency, not for scale: every viewer holds a session on a media server, and CDNs cannot cache it like files. On demand video does not need sub-second latency.',
          },
        ],
      },
      points: [
        'The bitrate ladder: for example 240p at 0.4 Mbps, 360p at 0.8, 480p at 1.4, 720p at 2.8 and 1080p at 5, roughly, in H.264. Per-title encoding tunes the ladder to each video, since a cartoon needs fewer bits than sports. A 4K source adds 1440p and 2160p rungs on top, usually only in VP9 or AV1.',
        'Segments of 2 to 6 seconds (4 here). Every rendition places keyframes at the same boundaries, so the player can switch between any two segments.',
        'A master playlist (HLS) or MPD (DASH) lists the renditions; each rendition lists its segments. Packaging as CMAF lets one set of fragmented MP4 segments serve both HLS and DASH, halving storage and cache footprint.',
        'Players start at a low rendition for a fast first frame, then climb as the buffer fills; buffer-based algorithms avoid oscillating on noisy throughput.',
        'Codecs trade encoding cost for bandwidth: VP9 and AV1 need tens of percent fewer bits than H.264 for the same quality but cost many times more to encode, so encode them only for videos that earn views.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Deliver through the CDN',
      prompt:
        'Every viewer fetches a segment every 4 seconds. How many requests is that, and how do you keep them away from object storage?',
      estimate: {
        question: 'Average segment requests per second worldwide',
        answer: 3_472_222,
        unit: 'requests/s',
        working: [
          'Concurrent viewers, from the egress estimate: about 13.9 million.',
          'Each fetches one 4-second segment every 4 seconds: 13.9 million / 4 is about 3.5 million requests a second.',
          'Twice that at peak, about 7 million, all for immutable files: exactly what CDNs are built for.',
        ],
      },
      decision: {
        question: 'A huge channel premieres a video and 5 million people press play in the first minute. What keeps the origin standing?',
        options: [
          {
            label: 'An origin shield tier that coalesces misses, plus pushing the first segments to edges before the premiere',
            best: true,
            why: 'Thousands of edges missing the same new segment become one fetch per shield, and a shield collapses concurrent requests for one object into a single origin read. Pre-warming the known premiere removes even those first misses.',
          },
          {
            label: 'Scale out the origin servers for the spike',
            why: 'It treats the symptom: every edge location still misses the new segments at once, and scaling in minutes is too slow for a premiere that starts at a set time.',
          },
          {
            label: 'Raise the cache TTL on segments',
            why: 'Segments never change, so they can already be cached for as long as the edge has room. TTL does not help the first request for an object no edge has yet, which is the whole problem here.',
          },
        ],
      },
      points: [
        'Mark segments immutable with a long `max-age`: a new encode gets new URLs, so they never need purging. The master playlist changes when publishing early adds renditions, so give it a short TTL or a versioned URL from the metadata API, and purge a video from the CDN when it is taken down.',
        'Tiers: edges in or near ISPs (many large platforms place cache appliances inside ISP networks), a regional shield tier, then object storage in a few regions. Each tier sees only the misses of the one before it.',
        'Hit rates are highest for popular videos and poor for the long tail, which is why the shield exists: it holds far more than any edge and turns scattered edge misses into shared hits.',
        'Use several CDNs or your own plus others, and let the player or a steering service switch when one degrades; the manifest can list alternate hosts.',
      ],
    },
    {
      kind: 'data',
      title: 'Store videos and counts',
      prompt:
        'Every uploaded hour is kept as a ladder of renditions. How much storage does a day of uploads add, and where do metadata and view counts live?',
      estimate: {
        question: 'Rendition storage added per day, before replication',
        answer: 3.24,
        unit: 'PB',
        working: [
          'Hours uploaded per day: 500 a minute times 1,440 minutes is 720,000.',
          'The ladder above adds up to about 10 Mbps; one hour at 10 Mbps is 10 Mb times 3,600 seconds, 36,000 Mb, which is 4.5 GB.',
          'Per day: 720,000 hours times 4.5 GB is about 3.24 PB, more than 1 EB a year, before the originals, 4K rungs and extra codecs.',
        ],
      },
      points: [
        'Video bytes live in object storage, keyed by video, rendition and segment; the database holds only metadata and pointers.',
        'Metadata: a `videos` table sharded by video ID (channel, title, status, duration, renditions, visibility), plus a per-channel list sorted by upload time. Reads are cached; writes are rare.',
        'View counts: players emit events, a stream processor deduplicates and filters bots, aggregates per video in short windows and adds one increment per video per window to a counter store. A viral video costs one write per window, not one per view.',
        'The public count may lag by minutes and is never recomputed on the play path. Watch time and analytics go to a separate warehouse from the same event stream.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Tier by popularity',
      prompt:
        'A small fraction of videos draws most of the views, and most videos are watched a handful of times after the first week. How do you stop paying hot-storage prices for the tail?',
      points: [
        'Popularity is heavily skewed (roughly Zipf-like): a hot head, served almost entirely by CDN caches, and a long tail that rarely hits any cache and reaches object storage directly.',
        'Move storage class by access pattern: a video unwatched for months moves its renditions to an infrequent-access class, which is cheaper to store and costlier to read. Keep at least one playable rendition in a class with instant reads.',
        'Put only the original or a high-quality mezzanine copy in archive storage, whose retrievals can take hours. Drop rarely played high renditions and re-create them on demand or when views return.',
        'Spend compute where views are: expensive codecs such as AV1 and higher resolutions are worth it for the head, where each saved bit is multiplied by millions of plays, and wasted on the tail.',
        'Replicate hot videos to more regions and keep the tail in fewer; a trending signal from the view stream can promote a video before its cache misses pile up.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'You have five minutes left. What would you raise before the interviewer does?',
      points: [
        'Private and paid content: short-lived signed URLs or tokens checked at the edge, and DRM (Widevine, FairPlay, PlayReady) when the owner requires it.',
        'Failure: a lost transcoding worker only delays a job; a CDN outage shifts traffic to another CDN or region; the metadata store is replicated across zones.',
        'Abuse and rights: copyright fingerprinting and safety classifiers run as branches of the transcoding DAG, and a flagged video can be blocked at the metadata layer and purged from the CDN at once.',
        'Monitoring: time to first frame, rebuffering ratio, CDN hit rate per tier, transcoding queue age and upload success rate.',
      ],
    },
  ],
  pitfalls: [
    'Serving video bytes from the application servers instead of object storage behind a CDN, the only place 42 Tbps can come from.',
    'One file per resolution with no adaptive bitrate, so a weakening network stalls playback.',
    'Transcoding inside the upload request, or one worker per whole file, so long uploads take hours and one crash restarts everything.',
    'Updating a view count row on every play, turning the hottest videos into the hottest rows.',
    'Keeping every rendition of every video in hot storage forever, or putting the only copy in an archive class that takes hours to read.',
  ],
  followUps: [
    {
      question: 'The product now wants live streaming. What changes?',
      answer:
        'Creators push a continuous stream (RTMP, SRT or WebRTC) to an ingest server near them, which transcodes the ladder in real time and publishes segments every few seconds. Live manifests change constantly, so they get a TTL of at most half a segment while segments stay immutable. Low-latency HLS or DASH with partial segments brings delay from tens of seconds down to a few, and the recording is then fed through the on demand pipeline.',
    },
    {
      question: 'A transcoding worker dies halfway through a chunk. What happens?',
      answer:
        'Its job lease expires and the orchestrator puts the job back on the queue. Another worker encodes the chunk again and writes to the same output path, so the retry simply overwrites any partial output. Nothing downstream starts until every chunk of that rendition reports success.',
    },
    {
      question: 'How do you cut the bandwidth bill by a third without hurting quality?',
      answer:
        'Re-encode the most watched videos with a more efficient codec such as AV1 for devices that decode it, tune the ladder per title, and cap the rendition to the screen size, so a phone never pulls 4K. Serving more from caches inside ISP networks also lowers transit costs.',
    },
  ],
};
