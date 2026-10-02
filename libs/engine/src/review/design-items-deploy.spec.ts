import { describe, expect, it } from 'vitest';
import { distribution, secondsSpan } from '../sysdesign/cases/deploy/distribution.js';
import { hostsText, rollout, type RolloutSettings } from '../sysdesign/cases/deploy/rollout.js';
import { durationText } from '../sysdesign/cases/email/smtp-retry.js';
import { generateQuestion, getReviewItem } from './items.js';

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7_919 + 3);
const IDS = [
  'rollout-blast-radius',
  'rollout-duration',
  'artifact-fan-out',
  'peer-to-peer-fan-out',
  'expand-contract',
  'desired-state',
  'canary-baseline',
  'artifact-digest',
];
const right = (id: string, seed: number) => {
  const q = generateQuestion(`sd:${id}`, seed);
  return { q, answer: q.choices[q.answer] };
};
const numbers = (text: string) => [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)/g)].map((m) => Number(m[1].replaceAll(',', '')));
const minutes = (text: string) => {
  const [, v, unit] = text.match(/(\d+) (min|h)\b/)!;
  return Number(v) * (unit === 'h' ? 60 : 1);
};

/** The plan a rollout item's prompt states. */
function planOf(prompt: string, detect = false): RolloutSettings {
  const [fleet, canaryPct, , waves] = numbers(prompt);
  const bake = prompt.match(/baking (\d+ (?:min|h))/)?.[1];
  return {
    fleet,
    canaryPct,
    waves,
    shape: 'equal',
    bakeMin: bake ? minutes(bake) : 0,
    maxUnavailablePct: (numbers(prompt.split('; ')[1])[0] / fleet) * 100,
    hostMin: 5,
    detectMin: detect ? minutes(prompt.split('flags it ')[1]) : 20,
  };
}

describe('code deployment review items', () => {
  it('reviews the case under its topics', () => {
    expect(IDS.map((id) => getReviewItem(`sd:${id}`)?.topic)).toEqual([
      'sd-reliability',
      'sd-estimation',
      'sd-cdn',
      'sd-cdn',
      'sd-data-modeling',
      'sd-consistency',
      'sd-observability',
      'sd-security',
    ]);
  });

  it('offers four distinct choices with one right answer on every seed', () => {
    for (const id of IDS)
      for (const seed of SEEDS) {
        const { q } = right(id, seed);
        expect(new Set(q.choices).size, `${id} ${seed}`).toBe(4);
        expect(q.answer).toBeGreaterThanOrEqual(0);
      }
  });

  it('works the numbers out from the models', () => {
    for (const seed of SEEDS) {
      const blast = right('rollout-blast-radius', seed);
      expect(blast.answer, blast.q.prompt).toBe(hostsText(rollout(planOf(blast.q.prompt, true)).exposed));

      const duration = right('rollout-duration', seed);
      expect(duration.answer, duration.q.prompt).toBe(durationText(rollout(planOf(duration.q.prompt)).totalMin));

      const fan = right('artifact-fan-out', seed);
      const [hosts, sizeMb, originGbps] = numbers(fan.q.prompt);
      const run = distribution({ sizeMb, hosts, originGbps, caches: 0, p2p: false, delta: false });
      expect(fan.answer, fan.q.prompt).toBe(secondsSpan(run.seconds));
    }
  });

  it('asks varied numeric questions', () => {
    for (const id of ['rollout-blast-radius', 'rollout-duration', 'artifact-fan-out'])
      expect(new Set(SEEDS.map((s) => generateQuestion(`sd:${id}`, s).prompt)).size, id).toBeGreaterThanOrEqual(5);
  });
});
