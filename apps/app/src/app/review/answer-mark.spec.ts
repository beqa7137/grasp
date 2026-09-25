import { answerMark } from './answer-mark';

describe('answerMark', () => {
  it('marks nothing before the question is answered', () => {
    expect([0, 1, 2].map((i) => answerMark(i, 1, null))).toEqual([null, null, null]);
  });

  it('marks a right pick as the answer and correct', () => {
    expect([0, 1, 2].map((i) => answerMark(i, 1, 1))).toEqual([null, { icon: 'checkmark-circle', label: 'your answer, correct' }, null]);
  });

  it('marks a wrong pick and the right answer, and leaves the other choices alone', () => {
    expect([0, 1, 2].map((i) => answerMark(i, 1, 2))).toEqual([
      null,
      { icon: 'checkmark-circle', label: 'correct answer' },
      { icon: 'close-circle', label: 'your answer, wrong' },
    ]);
  });
});
