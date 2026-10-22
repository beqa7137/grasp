import { num, spacedChoices, type WidgetCheckpoint } from '../widget-checkpoint.js';

/** Stated assumptions of the retry model. Times are in minutes. */
export const SMTP_RETRY = {
  /** Messages our users send to the domain each minute, spread evenly. */
  perMinute: 20,
} as const;

/** The stops each slider moves through, in minutes. */
export const OUTAGE_STOPS = [5, 15, 30, 60, 120, 180, 360, 720, 1_440, 2_880, 4_320, 5_760, 7_200, 8_640, 10_080, 14_400] as const;
export const FIRST_RETRY_STOPS = [1, 2, 5, 10, 15, 30] as const;
export const LONGEST_STOPS = [30, 60, 120, 240, 480] as const;
export const LIFETIME_STOPS = [240, 720, 1_440, 2_880, 4_320, 5_760, 7_200, 10_080] as const;

/** What the remote server answers while it is broken: a 4xx (try again later) or a 5xx (permanent failure). */
export type SmtpReply = 'temporary' | 'permanent';

export interface SmtpRetrySettings {
  /** How long the remote server stays broken, from the moment our first message to it is sent. */
  outageMin: number;
  /** The wait before the first retry; each later wait doubles, up to `longestMin`. */
  firstRetryMin: number;
  longestMin: number;
  /** How long a message may stay queued: the first failed attempt at or past it bounces the message. */
  lifetimeMin: number;
  reply: SmtpReply;
}

export interface SmtpRetryRun {
  /** When each attempt is made for a message sent as the outage begins, the first at 0. */
  attempts: number[];
  outcome: 'delivered' | 'bounced';
  /** When the message is delivered or bounced. */
  atMin: number;
  /** How long the delivered message waited after the server was back, or null when it bounced. */
  afterRecoveryMin: number | null;
  /** Messages to the domain still queued when the server comes back. */
  queued: number;
  /** Messages to the domain that bounced while the server was broken. */
  bounced: number;
  /** After the server is back, how long until the last queued message is delivered. */
  drainMin: number;
}

/** The wait before attempt `k` (1 for the first retry): the first wait doubled each time, capped at the longest. */
export const retryWait = (k: number, first: number, longest: number) => Math.min(first * 2 ** (k - 1), longest);

/** Times of the attempts, the first at 0, until one is made at or after `until`. */
export function attemptTimes(first: number, longest: number, until: number): number[] {
  const times = [0];
  for (let k = 1; times.at(-1)! < until; k++) times.push(times.at(-1)! + retryWait(k, first, longest));
  return times;
}

/** When a message is given up on: its first attempt at or after the queue lifetime, counted from when it was sent. */
export const bounceAfter = (s: SmtpRetrySettings) => attemptTimes(s.firstRetryMin, s.longestMin, s.lifetimeMin).at(-1)!;

/**
 * The longest a queued message waits after the server is back, when the oldest queued message is `oldest` minutes old: a
 * message just past an attempt waits the whole next interval, and the oldest one's interval is the longest.
 */
function drainFor(s: SmtpRetrySettings, oldest: number): number {
  const times = attemptTimes(s.firstRetryMin, s.longestMin, oldest);
  return times.at(-1)! - times.at(-2)!;
}

export function smtpRetry(s: SmtpRetrySettings): SmtpRetryRun {
  if (!(s.outageMin > 0 && s.firstRetryMin > 0 && s.longestMin >= s.firstRetryMin && s.lifetimeMin > 0))
    throw new Error('Settings must be positive, the longest wait at least the first');
  const sent = SMTP_RETRY.perMinute * s.outageMin;
  if (s.reply === 'permanent')
    return { attempts: [0], outcome: 'bounced', atMin: 0, afterRecoveryMin: null, queued: 0, bounced: sent, drainMin: 0 };
  const attempts = attemptTimes(s.firstRetryMin, s.longestMin, Math.min(s.outageMin, s.lifetimeMin));
  const atMin = attempts.at(-1)!;
  const delivered = atMin >= s.outageMin;
  // A lifetime at least as long as the outage gives up only after the server is back, so every queued message waits it out.
  const giveUp = s.lifetimeMin >= s.outageMin ? s.outageMin : bounceAfter(s);
  const oldest = Math.min(s.outageMin, giveUp);
  return {
    attempts,
    outcome: delivered ? 'delivered' : 'bounced',
    atMin,
    afterRecoveryMin: delivered ? atMin - s.outageMin : null,
    queued: SMTP_RETRY.perMinute * oldest,
    bounced: SMTP_RETRY.perMinute * Math.max(0, s.outageMin - giveUp),
    drainMin: drainFor(s, oldest),
  };
}

const plural = (v: number, unit: string) => `${num(v)} ${unit}${v === 1 ? '' : 's'}`;

/** A duration in days, hours and minutes, the zero parts left out: `6 h 15 min`, `5 d`. */
export function durationText(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)} s`;
  const total = Math.round(minutes);
  const d = Math.floor(total / 1_440);
  const h = Math.floor((total % 1_440) / 60);
  const m = total % 60;
  return [d && `${d} d`, h && `${h} h`, m && `${m} min`].filter(Boolean).join(' ');
}

/** The same duration in words, for screen readers. */
export function durationSpoken(minutes: number): string {
  const total = Math.round(minutes);
  const d = Math.floor(total / 1_440);
  const h = Math.floor((total % 1_440) / 60);
  const m = total % 60;
  const parts = [d && plural(d, 'day'), h && plural(h, 'hour'), m && plural(m, 'minute')].filter(Boolean);
  return parts.length ? parts.join(' ') : '0 minutes';
}

const attemptsText = (v: number) => plural(v, 'attempt');
export const messagesText = (v: number) => plural(v, 'message');

const fateText = (run: SmtpRetryRun) =>
  run.outcome === 'delivered'
    ? `Delivered after ${durationText(run.atMin)}`
    : run.atMin === 0
      ? 'Bounced at once, on the first attempt'
      : `Bounced after ${durationText(run.atMin)}`;

const describe = (s: SmtpRetrySettings) =>
  `the remote server is broken for ${durationText(s.outageMin)} and answers ${s.reply === 'temporary' ? '451 (try again later)' : '550 (permanent failure)'}. We retry after ${durationText(s.firstRetryMin)}, doubling the wait up to ${durationText(s.longestMin)}, and give up after ${durationText(s.lifetimeMin)} in the queue`;

type RetryQuestion = 'fate' | 'attempts' | 'drain';

/** Picked from the settings, never the outcome, so it varies as the learner moves them; a 5xx always asks the fate. */
function questionFor(s: SmtpRetrySettings): RetryQuestion {
  if (s.reply === 'permanent') return 'fate';
  const at = (stops: readonly number[], v: number) => stops.indexOf(v);
  const pick =
    at(OUTAGE_STOPS, s.outageMin) +
    2 * at(FIRST_RETRY_STOPS, s.firstRetryMin) +
    at(LONGEST_STOPS, s.longestMin) +
    at(LIFETIME_STOPS, s.lifetimeMin);
  return (['fate', 'attempts', 'drain'] as const)[((pick % 3) + 3) % 3];
}

/** Fates far enough apart in time, within each kind, that only one fits: the right one first, then the distractors. */
function fateChoices(run: SmtpRetryRun, others: SmtpRetryRun[]): Pick<WidgetCheckpoint, 'choices' | 'answer'> {
  const kept = [run];
  const apart = (a: SmtpRetryRun, b: SmtpRetryRun) =>
    a.outcome !== b.outcome || (a.atMin !== b.atMin && Math.abs(a.atMin - b.atMin) >= 0.25 * Math.max(a.atMin, b.atMin));
  for (const o of others) if (kept.length < 4 && kept.every((k) => apart(k, o))) kept.push(o);
  const ordered = [...kept].sort((a, b) => a.atMin - b.atMin || (a.outcome === 'bounced' ? -1 : 1));
  return { choices: ordered.map(fateText), answer: ordered.indexOf(run) };
}

/**
 * A prediction about the current settings, read from the run: what happens to a message sent as the outage begins and
 * when, how many attempts that takes, or how long after the server is back the queue for the domain is empty.
 * Distractors are what the same question gives under neighboring settings, or a common mistake.
 */
export function smtpRetryCheckpoint(s: SmtpRetrySettings, run = smtpRetry(s)): WidgetCheckpoint {
  const temporary = s.reply === 'temporary' ? run : smtpRetry({ ...s, reply: 'temporary' });
  const forever = smtpRetry({ ...s, reply: 'temporary', lifetimeMin: Number.MAX_SAFE_INTEGER });
  const neighbors = [
    { ...s, longestMin: s.longestMin * 4 },
    { ...s, firstRetryMin: s.firstRetryMin * 4, longestMin: Math.max(s.longestMin, s.firstRetryMin * 4) },
    { ...s, longestMin: Math.max(s.firstRetryMin, s.longestMin / 4) },
  ].map((n) => smtpRetry({ ...n, reply: 'temporary' }));
  const situation = describe(s);
  const question = questionFor(s);
  const giveUp = bounceAfter(s);
  if (question === 'fate') {
    const atOnce: SmtpRetryRun = { ...run, outcome: 'bounced', atMin: 0 };
    const atRecovery: SmtpRetryRun = { ...run, outcome: 'delivered', atMin: s.outageMin };
    const lifetimeBounce: SmtpRetryRun = { ...run, outcome: 'bounced', atMin: giveUp };
    const others = [atOnce, temporary, forever, lifetimeBounce, atRecovery, ...neighbors];
    const why =
      s.reply === 'permanent'
        ? `A 5xx reply says the failure is permanent, so the sending server does not retry: it bounces the message to the sender at once, and every one of the ${messagesText(run.bounced)} sent during the outage bounces the same way. That is why a receiving server whose own storage or directory is down must answer 4xx, never 5xx.`
        : run.outcome === 'delivered'
          ? `A 4xx reply means try again later. The attempts land at ${run.attempts.map(durationText).slice(0, 6).join(', ')}${run.attempts.length > 6 ? ' and so on' : ''}; the first one at or after the ${durationText(s.outageMin)} outage, attempt ${run.attempts.length}, succeeds ${run.afterRecoveryMin ? `${durationText(run.afterRecoveryMin)} after the server is back` : 'just as the server is back'}.`
          : `A 4xx reply means try again later, but the server is broken longer than the ${durationText(s.lifetimeMin)} the queue keeps a message: the first failed attempt at or past that age, at ${durationText(run.atMin)}, bounces it to the sender with a delivery status notification.`;
    return {
      prompt: `Predict: ${situation}. What happens to a message sent as the outage begins?`,
      ...fateChoices(run, others),
      explain: why,
    };
  }
  if (question === 'attempts') {
    const count = run.attempts.length;
    const fixed = Math.floor(Math.min(s.outageMin, giveUp) / s.firstRetryMin) + 1;
    const uncapped = smtpRetry({ ...s, longestMin: Number.MAX_SAFE_INTEGER });
    const waits = [1, 2, 3, 4].map((k) => durationText(retryWait(k, s.firstRetryMin, s.longestMin)));
    return {
      prompt: `Predict: ${situation}. How many delivery attempts does a message sent as the outage begins get, the first one included?`,
      ...spacedChoices(count, [fixed, uncapped.attempts.length, ...neighbors.map((n) => n.attempts.length)], attemptsText, 1),
      explain: `The waits between attempts run ${waits.join(', ')} and so on, never longer than ${durationText(s.longestMin)}. Attempt ${count}, at ${durationText(run.atMin)}, is the first at or after ${run.outcome === 'delivered' ? `the ${durationText(s.outageMin)} outage, so it delivers the message` : `the ${durationText(s.lifetimeMin)} queue lifetime while the server is still broken, so it bounces the message`}.`,
    };
  }
  const oldest = Math.min(s.outageMin, giveUp);
  return {
    prompt: `Predict: ${situation}. ${SMTP_RETRY.perMinute} messages a minute go to that domain. Once its server is back, how long until the last of them still queued is delivered?`,
    ...spacedChoices(run.drainMin, [s.firstRetryMin, s.longestMin, s.outageMin, ...neighbors.map((n) => n.drainMin)], durationText, 1),
    explain: `In this model, as in Postfix by default, nothing tells the queue the server is back, so each queued message waits for its own next attempt. The oldest of the ${messagesText(run.queued)} queued is ${durationText(oldest)} old, and its wait between attempts has grown to ${durationText(run.drainMin)}; a message whose last attempt failed just before recovery waits almost that whole interval. A longer cap means a longer tail after every outage.`,
  };
}
