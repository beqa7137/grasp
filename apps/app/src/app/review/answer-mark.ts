export interface AnswerMark {
  icon: 'checkmark-circle' | 'close-circle';
  label: string;
}

/** The icon on a choice once the question is answered, named so the pick and the right answer are not told by color alone. */
export function answerMark(index: number, answer: number, chosen: number | null): AnswerMark | null {
  if (chosen === null) return null;
  if (index === answer) return { icon: 'checkmark-circle', label: index === chosen ? 'your answer, correct' : 'correct answer' };
  return index === chosen ? { icon: 'close-circle', label: 'your answer, wrong' } : null;
}
