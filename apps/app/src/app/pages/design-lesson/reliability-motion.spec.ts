import {
  RELIABILITY_SETTINGS,
  RELIABILITY_WEEKS,
  reliabilityPlayPlan,
  reliabilityRestMoment,
  reliabilityScenario,
  reliabilityYear,
} from '@grasp/engine';
import { buildStage } from './reliability-layout';
import { PLAYHEAD_CLEAR, clipX, playheadX } from './reliability-motion';
import { NOTHING_HIDDEN } from './reliability-words';

describe('the Reliability play', () => {
  it('shows no tick before its week, stands the playhead clear of each held tick, and ends at week 52', () => {
    for (const s of RELIABILITY_SETTINGS.filter((_, i) => i % 11 === 0)) {
      const m = reliabilityScenario(s);
      const st = buildStage(
        620,
        m,
        reliabilityYear(s),
        {
          hid: NOTHING_HIDDEN,
          moment: reliabilityRestMoment(s),
          into: 1,
          playing: false,
          ghost: null,
          challenge: null,
          focus: [],
          watch: '',
        },
        '',
      );
      const yr = st.year;
      const plan = reliabilityPlayPlan(s);
      let lastClip = -1;
      let lastHead = -1;
      for (let t = 0; t <= plan.total; t += 16) {
        const c = plan.at(t);
        const clip = clipX(yr, c.weeks);
        const head = playheadX(yr, plan, c.weeks);
        expect(clip).toBeGreaterThanOrEqual(lastClip);
        expect(head).toBeGreaterThanOrEqual(lastHead - 0.05);
        lastClip = clip;
        lastHead = head;
        // A week's tick shows only once the clock has passed its center.
        for (let w = 0; w < RELIABILITY_WEEKS; w++)
          if (yr.wk(w) + yr.tickW / 2 <= clip) expect(w + 0.5).toBeLessThanOrEqual(c.weeks + 1e-6);
        if (c.hold) {
          expect(head - yr.wk(c.hold.week)).toBeGreaterThanOrEqual(yr.tickW / 2 + PLAYHEAD_CLEAR - 0.05);
          expect(clip).toBeGreaterThanOrEqual(yr.wk(c.hold.week) + yr.tickW / 2);
        }
      }
      expect(clipX(yr, plan.at(plan.total).weeks)).toBeCloseTo(yr.tx1, 1);
      // No band change runs shorter than 240 ms: holds stand three weeks of sweep apart.
      const reach = plan.holds.map((_, i) => plan.holdAt(i, 0));
      for (let i = 1; i < reach.length; i++) expect(reach[i] - reach[i - 1]).toBeGreaterThanOrEqual(240);
    }
  }, 240_000);
});
