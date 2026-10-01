import { num, spacedChoices, type WidgetCheckpoint } from '../widget-checkpoint.js';

/** Stated assumptions of the propagation model. Sizes in KB (1,000 bytes). */
export const PROPAGATION = {
  /** The whole ruleset of one environment: about 400 flags of 2.5 KB with their rules and segments. */
  rulesetKb: 1_000,
  /** One changed flag, sent as a patch. */
  changeKb: 2,
  /** Request and response headers of a poll that carries no body, such as a 304 Not Modified. */
  headerKb: 0.5,
  /** CDN edge locations that each revalidate the cached ruleset once per TTL. */
  cdnEdges: 50,
  /** From a saved change to a new ruleset version at the origin and on the stream servers. */
  publishS: 0.5,
  connectionsPerServer: 10_000,
  /** Small messages one stream server writes a second. */
  sendsPerServerS: 50_000,
} as const;

export type FlagDelivery = 'stream' | 'poll';
/** What a poll downloads: the whole ruleset every time, the whole ruleset only when its ETag changed, or the changes since the SDK's version. */
export type PollPayload = 'full' | 'etag' | 'delta';

export interface PropagationSettings {
  /** SDK instances, one per process that evaluates flags. */
  instances: number;
  delivery: FlagDelivery;
  intervalS: number;
  payload: PollPayload;
  /** Polls go through a CDN that caches the ruleset for one polling interval. */
  cdn: boolean;
  /** Flag changes a minute in the environment. */
  changesPerMin: number;
}

export interface PropagationRun {
  /** Seconds from a saved change until the last instance has it, and on average. */
  worstS: number;
  typicalS: number;
  /** Requests a second the flag service itself answers. */
  originRps: number;
  /** Bytes a second leaving the flag service, and reaching all SDKs together (from the CDN when there is one). */
  originBytesS: number;
  sdkBytesS: number;
  /** Open streams, and the servers holding them. */
  streams: number;
  streamServers: number;
}

export const PROPAGATION_LIMITS = {
  instances: { min: 1_000, max: 100_000, step: 1_000 },
  intervalS: { min: 5, max: 300, step: 5 },
  changesPerMin: { min: 0, max: 30, step: 1 },
} as const;

/** Bytes one poll downloads when changes arrive at random (Poisson) at `perS` a second and the SDK polls every `intervalS`. */
export function pollKb(payload: PollPayload, intervalS: number, perS: number): number {
  const { rulesetKb, changeKb, headerKb } = PROPAGATION;
  if (payload === 'full') return rulesetKb;
  if (payload === 'etag') return headerKb + rulesetKb * (1 - Math.exp(-perS * intervalS));
  return headerKb + perS * intervalS * changeKb;
}

export function propagation(s: PropagationSettings): PropagationRun {
  if (!(s.instances > 0 && s.intervalS > 0 && s.changesPerMin >= 0)) throw new Error('Settings must be positive');
  const { publishS, connectionsPerServer, sendsPerServerS, changeKb, cdnEdges } = PROPAGATION;
  const perS = s.changesPerMin / 60;
  if (s.delivery === 'stream') {
    const fanoutS = Math.min(s.instances, connectionsPerServer) / sendsPerServerS;
    const bytes = s.instances * perS * changeKb * 1000;
    return {
      worstS: publishS + fanoutS,
      typicalS: publishS + fanoutS / 2,
      originRps: 0,
      originBytesS: bytes,
      sdkBytesS: bytes,
      streams: s.instances,
      streamServers: Math.ceil(s.instances / connectionsPerServer),
    };
  }
  const pollBytes = pollKb(s.payload, s.intervalS, perS) * 1000;
  const sdkRps = s.instances / s.intervalS;
  const originRps = s.cdn ? Math.min(s.instances, cdnEdges) / s.intervalS : sdkRps;
  // A CDN copy is up to one interval old when the SDK fetches it, so it adds up to one more interval.
  const waits = s.cdn ? 2 : 1;
  return {
    worstS: publishS + waits * s.intervalS,
    typicalS: publishS + (waits * s.intervalS) / 2,
    originRps,
    originBytesS: originRps * pollBytes,
    sdkBytesS: sdkRps * pollBytes,
    streams: 0,
    streamServers: 0,
  };
}

export const secondsText = (v: number) => `${v < 10 ? Number(v.toFixed(2)) : num(v)} s`;

export function bytesRate(bytesS: number): string {
  const [unit, size] = bytesS >= 1e9 ? ['GB', 1e9] : bytesS >= 1e6 ? ['MB', 1e6] : bytesS >= 1e3 ? ['KB', 1e3] : ['bytes', 1];
  const v = bytesS / (size as number);
  return `${v < 10 && unit !== 'bytes' ? Number(v.toFixed(1)) : num(v)} ${unit}/s`;
}

const PAYLOADS: Record<PollPayload, string> = {
  full: 'the whole ruleset',
  etag: 'the whole ruleset only when its ETag changed',
  delta: 'only the changes since the version they hold',
};

const describe = (s: PropagationSettings) =>
  s.delivery === 'stream'
    ? `${num(s.instances)} instances hold streams`
    : `${num(s.instances)} instances poll every ${secondsText(s.intervalS)}${s.cdn ? ' through a CDN' : ''}, downloading ${PAYLOADS[s.payload]}`;

type Question = 'converge' | 'requests' | 'bandwidth';

/** Picked only from the settings the learner can see: a stream hides the interval, the payload and the CDN. */
function questionFor(s: PropagationSettings): Question {
  const shown = s.instances / 1000 + s.changesPerMin * 7;
  if (s.delivery === 'stream') return shown % 3 === 0 ? 'bandwidth' : 'converge';
  const pick = (shown + s.intervalS / 5 + (s.cdn ? 11 : 0) + s.payload.length * 3) % 3;
  return (['converge', 'requests', 'bandwidth'] as const)[pick];
}

/**
 * A prediction about the current settings, picked from them so it varies as the learner moves them: how long the last
 * instance waits for a change, how many requests a second reach the flag service, or how many bytes a second leave it.
 * Distractors are what the same question gives under neighbouring settings.
 */
export function propagationCheckpoint(s: PropagationSettings): WidgetCheckpoint {
  const run = propagation(s);
  const other = (change: Partial<PropagationSettings>) => propagation({ ...s, ...change });
  const neighbours = [
    other({ cdn: !s.cdn }),
    other({ delivery: s.delivery === 'stream' ? 'poll' : 'stream' }),
    other({ payload: s.payload === 'full' ? 'delta' : 'full' }),
    other({ intervalS: s.intervalS * 2 }),
    other({ instances: s.instances * 10 }),
    other({ changesPerMin: s.changesPerMin + 10 }),
    other({ delivery: 'poll', payload: 'delta' }),
    other({ delivery: 'poll', cdn: !s.cdn }),
  ];
  const situation = `${describe(s)}, with ${num(s.changesPerMin)} flag change${s.changesPerMin === 1 ? '' : 's'} a minute`;
  const question = questionFor(s);
  if (question === 'converge') {
    const why =
      s.delivery === 'stream'
        ? `The change is published in ${secondsText(PROPAGATION.publishS)}, then each stream server writes it to its ${num(Math.min(s.instances, PROPAGATION.connectionsPerServer))} connections at ${num(PROPAGATION.sendsPerServerS)} a second: ${secondsText(run.worstS - PROPAGATION.publishS)} more. Servers work in parallel, so more instances add servers, not time.`
        : `An instance that polled just before the change waits a whole interval, ${secondsText(s.intervalS)}${s.cdn ? `, and the CDN copy it gets can be one more interval old` : ''}: ${secondsText(PROPAGATION.publishS)} to publish plus ${s.cdn ? `2 × ${secondsText(s.intervalS)}` : secondsText(s.intervalS)}. On average an instance waits half as long after publishing, ${secondsText(run.typicalS)} in all.`;
    return {
      prompt: `Predict: ${situation}. How long until the last instance has a change?`,
      ...spacedChoices(run.worstS, [run.typicalS, s.intervalS, ...neighbours.map((n) => n.worstS)], secondsText, 0.05),
      explain: why,
    };
  }
  if (question === 'requests') {
    const why = s.cdn
      ? `The instances ask the CDN ${num(s.instances / s.intervalS)} times a second, but each of its ${PROPAGATION.cdnEdges} edges asks the flag service only once per interval: ${PROPAGATION.cdnEdges} / ${secondsText(s.intervalS)} = ${num(run.originRps)}.`
      : `Every instance asks once per interval whether anything changed or not: ${num(s.instances)} / ${secondsText(s.intervalS)} = ${num(run.originRps)} a second.`;
    const perS = (v: number) => `${v < 10 ? Number(v.toFixed(1)) : num(v)} requests/s`;
    return {
      prompt: `Predict: ${situation}. How many requests a second reach the flag service?`,
      ...spacedChoices(run.originRps, [s.instances / s.intervalS, s.instances, ...neighbours.map((n) => n.originRps)], perS, 0.5),
      explain: why,
    };
  }
  const perPoll = pollKb(s.payload, s.intervalS, s.changesPerMin / 60);
  const why =
    s.delivery === 'stream'
      ? `A stream carries only the changes: ${num(s.instances)} instances × ${s.changesPerMin} / 60 changes a second × ${PROPAGATION.changeKb} KB = ${bytesRate(run.originBytesS)}, plus heartbeats this model leaves out.`
      : `Each poll downloads about ${Number(perPoll.toFixed(1)).toLocaleString('en-US')} KB (${PAYLOADS[s.payload]}${s.payload === 'etag' ? `: with ${s.changesPerMin} changes a minute, ${num((1 - Math.exp((-s.changesPerMin / 60) * s.intervalS)) * 100)}% of polls see one` : ''}), and ${num(run.originRps)} polls a second reach the service: ${bytesRate(run.originBytesS)}.`;
  return {
    prompt: `Predict: ${situation}. How many bytes a second leave the flag service?`,
    ...spacedChoices(run.originBytesS, [run.sdkBytesS, ...neighbours.map((n) => n.originBytesS)], bytesRate, 100),
    explain: why,
  };
}
