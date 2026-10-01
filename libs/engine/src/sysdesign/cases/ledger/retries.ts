import type { WidgetCheckpoint } from './checkpoint.js';

/**
 * What happens to one attempt of a payment request: the response comes back, the server does the work but the response is
 * lost on the way back, or the request never reaches the server. Lost and dropped look the same to the client: a timeout.
 */
export type AttemptFate = 'ok' | 'lost' | 'dropped';

/** No key, a fresh key on every attempt (a common bug), or one key made once per payment and resent on every retry. */
export type KeyMode = 'none' | 'per-attempt' | 'per-payment';

export const MAX_ATTEMPTS = 4;

export interface RetryStep {
  attempt: number;
  /** Whether this attempt charged the card and posted a journal entry. */
  charged: boolean;
  text: string;
}

export interface RetryRun {
  steps: RetryStep[];
  charges: number;
  /** Whether the client saw a response before running out of attempts. */
  confirmed: boolean;
}

/** The client sends attempts in order until one gets a response or `fates` runs out; the server charges unless it knows the key. */
export function retryRun(fates: readonly AttemptFate[], mode: KeyMode): RetryRun {
  if (!fates.length || fates.length > MAX_ATTEMPTS) throw new Error(`Between 1 and ${MAX_ATTEMPTS} attempts`);
  const steps: RetryStep[] = [];
  let charges = 0;
  let confirmed = false;
  for (const [i, fate] of fates.entries()) {
    const attempt = i + 1;
    const key =
      mode === 'none' ? 'with no key' : mode === 'per-attempt' ? 'with a new key' : attempt === 1 ? 'with its key' : 'with the same key';
    if (fate === 'dropped') {
      steps.push({ attempt, charged: false, text: `Attempt ${attempt} (${key}) never reaches the server. The client times out.` });
      continue;
    }
    const replay = mode === 'per-payment' && charges > 0;
    if (!replay) charges++;
    const work = replay
      ? 'the server finds the key already done and returns the stored result, charging nothing'
      : `the server charges the card and posts a journal entry (charge ${charges})`;
    const back = fate === 'ok' ? 'The client gets the response.' : 'The response is lost and the client times out.';
    steps.push({ attempt, charged: !replay, text: `Attempt ${attempt} (${key}): ${work}. ${back}` });
    if (fate === 'ok') {
      confirmed = true;
      break;
    }
  }
  return { steps, charges, confirmed };
}

/**
 * Expected charges per payment when every attempt independently loses its response with probability `lost`, never arrives
 * with probability `dropped`, and the client retries up to `retries` times. Without a key every arriving attempt charges;
 * with one key per payment only the first arriving attempt does.
 */
export function expectedCharges(lost: number, dropped: number, retries: number, mode: KeyMode): number {
  if (mode === 'per-payment') return 1 - dropped ** (retries + 1);
  const unanswered = lost + dropped;
  let sum = 0;
  for (let k = 0; k <= retries; k++) sum += unanswered ** k;
  return (1 - dropped) * sum;
}

const times = (n: number) => (n === 0 ? 'Not charged' : n === 1 ? 'Charged once' : n === 2 ? 'Charged twice' : `Charged ${n} times`);

/** Asks how many times the card is charged, from a menu that grows with the attempts so the answer is never the only fit. */
export function retryCheckpoint(fates: readonly AttemptFate[], mode: KeyMode): WidgetCheckpoint {
  const run = retryRun(fates, mode);
  const options = Math.max(3, run.steps.length + 1);
  const choices = Array.from({ length: options }, (_, n) => times(n));
  const sent = run.steps.length;
  const arrived = run.steps.filter((s) => fates[s.attempt - 1] !== 'dropped').length;
  const later = arrived - 1;
  const why = !arrived
    ? 'No attempt reached the server, so nothing was charged, and the client cannot tell that from a lost response.'
    : mode === 'per-payment'
      ? later
        ? `Every attempt carries the same key, so only the first of the ${arrived} that reached the server charged; the later ${later === 1 ? 'one gets' : `${later} get`} the stored result.`
        : 'Only one attempt reached the server, and it charged the card.'
      : `${mode === 'none' ? 'Without a key' : 'With a new key on every attempt'} the server cannot tell a retry from a new payment, so ${arrived === 1 ? 'the one attempt' : `each of the ${arrived} attempts`} that reached it charged the card.`;
  const end = run.confirmed
    ? `The client sent ${sent} attempt${sent === 1 ? '' : 's'} and got a response on the last.`
    : `The client gave up after ${sent} attempt${sent === 1 ? '' : 's'} without a response, so it cannot know whether it paid: it should ask the server for the payment's status, not show "failed".`;
  return {
    prompt: 'Predict: how many times is the card charged?',
    choices,
    answer: run.charges,
    explain: `${why} ${end}`,
  };
}
