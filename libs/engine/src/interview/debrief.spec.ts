import { describe, expect, it } from 'vitest';
import { debriefLoop, type LoopRoundCard } from './debrief.js';
import { INTERVIEW_RUBRICS, type InterviewTrack } from './rubrics.js';

const card = (track: InterviewTrack, verdict: string, scores: number[], change: Partial<LoopRoundCard> = {}): LoopRoundCard => ({
  track,
  sessionId: `session-${track}`,
  problemId: { coding: 'warmer-days', 'system-design': 'url-shortener', behavioral: 'conflict-1' }[track],
  patternIds: track === 'coding' ? ['monotonic-stack'] : [],
  ...(track === 'behavioral' ? { competencyId: 'conflict' } : {}),
  mode: 'ai',
  verdict,
  dimensions: INTERVIEW_RUBRICS[track].map((r, i) => ({ name: r.name, score: scores[i] })),
  weakPatterns: [],
  ...change,
});
const loop = (coding: string, design: string, behavioral: string) => [
  card('coding', coding, [3, 3, 3, 3, 3]),
  card('system-design', design, [3, 3, 3, 3, 3]),
  card('behavioral', behavioral, [3, 3, 3, 3, 3]),
];

describe('mock loop debrief', () => {
  it('reads the loop as the rounds’ average level, rounded down', () => {
    expect(debriefLoop(loop('hire', 'hire', 'hire'))).toMatchObject({ verdict: 'hire', heldBy: null });
    expect(debriefLoop(loop('strong-hire', 'hire', 'hire')).verdict).toBe('hire');
    expect(debriefLoop(loop('strong-hire', 'strong-hire', 'hire')).verdict).toBe('hire');
    expect(debriefLoop(loop('strong-hire', 'strong-hire', 'strong-hire')).verdict).toBe('strong-hire');
    expect(debriefLoop(loop('lean-hire', 'lean-no-hire', 'hire')).verdict).toBe('lean-hire');
    expect(debriefLoop(loop('no-hire', 'no-hire', 'no-hire')).verdict).toBe('no-hire');
  });

  it('never reads more than one level above the weakest round, and names the round that held it down', () => {
    expect(debriefLoop(loop('strong-hire', 'strong-hire', 'no-hire'))).toMatchObject({ verdict: 'lean-no-hire', heldBy: 'behavioral' });
    expect(debriefLoop(loop('hire', 'no-hire', 'hire'))).toMatchObject({ verdict: 'lean-no-hire', heldBy: 'system-design' });
    expect(debriefLoop(loop('hire', 'lean-no-hire', 'hire'))).toMatchObject({ verdict: 'lean-hire', heldBy: null });
  });

  it('counts the rounds scripted practice scored', () => {
    const rounds = loop('hire', 'hire', 'hire');
    expect(debriefLoop(rounds).scripted).toBe(0);
    expect(debriefLoop([{ ...rounds[0], mode: 'offline' }, rounds[1], { ...rounds[2], mode: 'offline' }]).scripted).toBe(2);
  });

  it('works for a loop of fewer rounds, and refuses one with none', () => {
    expect(debriefLoop([card('behavioral', 'lean-hire', [2, 3, 3, 3, 3])]).verdict).toBe('lean-hire');
    expect(() => debriefLoop([])).toThrow();
  });

  it('names up to three things to work on, lowest score first, one from each round before a second from any', () => {
    const rounds = [
      card('coding', 'lean-no-hire', [1, 1, 2, 3, 4], { weakPatterns: ['monotonic-stack'] }),
      card('system-design', 'lean-hire', [3, 2, 3, 3, 4]),
      card('behavioral', 'hire', [3, 3, 3, 3, 3]),
    ];
    const focus = debriefLoop(rounds).focus;
    expect(focus.map((f) => [f.track, f.dimension, f.score])).toEqual([
      ['coding', 'Problem understanding', 1],
      ['system-design', 'Estimation', 2],
      ['behavioral', 'Competency fit', 3],
    ]);
    expect(focus[0].lookFor).toBe(INTERVIEW_RUBRICS.coding[0].lookFor);

    const twoRounds = debriefLoop([rounds[0], card('system-design', 'hire', [4, 4, 4, 4, 3])]).focus;
    expect(twoRounds.map((f) => [f.track, f.score])).toEqual([
      ['coding', 1],
      ['coding', 1],
      ['system-design', 3],
    ]);
  });

  it('has nothing to work on when every dimension scored 4', () => {
    expect(debriefLoop([card('coding', 'strong-hire', [4, 4, 4, 4, 4])]).focus).toEqual([]);
  });

  it('links each item to where to practise it', () => {
    const coding = card('coding', 'lean-no-hire', [1, 4, 4, 4, 4], { weakPatterns: ['binary-search'] });
    expect(debriefLoop([coding]).focus[0].target).toEqual({ kind: 'pattern', patternId: 'binary-search' });
    expect(debriefLoop([{ ...coding, weakPatterns: [] }]).focus[0].target).toEqual({ kind: 'pattern', patternId: 'monotonic-stack' });
    expect(debriefLoop([{ ...coding, weakPatterns: [], patternIds: [] }]).focus[0].target).toEqual({
      kind: 'round',
      sessionId: 'session-coding',
    });

    const estimation = card('system-design', 'lean-hire', [4, 2, 4, 4, 4]);
    expect(debriefLoop([estimation]).focus[0].target).toEqual({ kind: 'design-topic', topicId: 'sd-estimation' });
    const scope = card('system-design', 'lean-hire', [2, 4, 4, 4, 4]);
    expect(debriefLoop([scope]).focus[0].target).toEqual({ kind: 'case', caseId: 'url-shortener' });
    expect(debriefLoop([{ ...scope, problemId: 'chat-service' }]).focus[0].target).toEqual({
      kind: 'round',
      sessionId: 'session-system-design',
    });

    const story = card('behavioral', 'lean-hire', [2, 3, 3, 3, 3]);
    expect(debriefLoop([story]).focus[0].target).toEqual({ kind: 'competency', competencyId: 'conflict' });
  });

  it('reads an unknown verdict as the lowest level rather than failing', () => {
    expect(debriefLoop([card('coding', 'maybe', [2, 2, 2, 2, 2])]).verdict).toBe('no-hire');
  });
});
