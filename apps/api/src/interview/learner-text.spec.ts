import { RUBRICS } from './prompts.js';
import type { Scorecard } from './interview.types.js';
import { learnerScorecard, learnerText } from './learner-text.js';

const EM = '\u2014';
const EN = '\u2013';

describe('learnerText', () => {
  it.each([
    [`A user pastes a long URL ${EM} what should happen next?`, 'A user pastes a long URL, what should happen next?'],
    [`Numbers match the reference${EM}good.`, 'Numbers match the reference, good.'],
    [`Okay ${EM}`, 'Okay'],
    [`${EM} and then?`, 'and then?'],
    [`It holds: ${EM} mostly.`, 'It holds: mostly.'],
    [`It works ${EM}.`, 'It works.'],
    [`Say \u201Cwe shipped it\u201D and don\u2019t hedge.`, `Say "we shipped it" and don't hedge.`],
    ['The **bold** claim and the *italic* one.', 'The bold claim and the italic one.'],
    ['Call `dp[i]` once.', 'Call dp[i] once.'],
    ['Here:\n```python\nreturn prev\n```\nWhy?', 'Here:\nreturn prev\nWhy?'],
    ['non\u00A0breaking', 'non breaking'],
  ])('rewrites %j', (raw, shown) => {
    expect(learnerText(raw)).toBe(shown);
  });

  it.each([
    `Latency of 10${EN}20 ms is fine.`,
    'O(n * m) or n*m cells, 2 * 3 * 4.',
    'def f(*args, **kwargs): pass',
    'self.__init__() and my_var_name',
    'The p99 is 250 ms. What changed?',
  ])('leaves %j as it is', (text) => {
    expect(learnerText(text)).toBe(text);
  });
});

describe('learnerScorecard', () => {
  it('rewrites every text the learner reads and keeps the rest', () => {
    const card: Scorecard = {
      verdict: 'hire',
      summary: `Solid ${EM} **clear** reasoning.`,
      dimensions: RUBRICS.behavioral.map((r) => ({ name: r.name, score: 3, evidence: `Said \u201Cmy fix\u201D.` })),
      strengths: ['`retry` budget'],
      improvements: [`Measure it ${EM} then say so.`],
      weakPatterns: [],
      mode: 'ai',
      flaws: [{ id: 'we-not-i', quote: 'we\u2019d fixed it', fix: `Say *I* fixed it ${EM} and how.` }],
      weakCompetencies: ['ownership'],
    };
    expect(learnerScorecard(card)).toEqual({
      ...card,
      summary: 'Solid, clear reasoning.',
      dimensions: card.dimensions.map((d) => ({ ...d, evidence: 'Said "my fix".' })),
      strengths: ['retry budget'],
      improvements: ['Measure it, then say so.'],
      flaws: [{ id: 'we-not-i', quote: "we'd fixed it", fix: 'Say I fixed it, and how.' }],
    });
  });

  it('adds no flaws to a card without them', () => {
    const card: Scorecard = {
      verdict: 'hire',
      summary: 's',
      dimensions: [],
      strengths: [],
      improvements: [],
      weakPatterns: [],
      mode: 'ai',
    };
    expect(learnerScorecard(card)).toEqual(card);
  });
});
