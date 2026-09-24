import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { generateQuestion, type Question } from '@grasp/engine';
import { QuestionCardComponent } from './question-card.component';

function render(question: Question, chosen: number | null = null) {
  TestBed.configureTestingModule({ imports: [QuestionCardComponent], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(QuestionCardComponent);
  fixture.componentRef.setInput('question', question);
  fixture.componentRef.setInput('reason', 'new');
  fixture.componentRef.setInput('chosen', chosen);
  fixture.detectChanges();
  return fixture;
}

describe('QuestionCardComponent', () => {
  it('renders the prompt, reason and every choice', () => {
    const q = generateQuestion('rec:h1', 7);
    const el: HTMLElement = render(q).nativeElement;
    expect(el.querySelector('.prompt')!.textContent).toContain(q.prompt);
    expect(el.querySelector('.reason')!.textContent).toContain('New');
    expect(el.querySelectorAll('.choice').length).toBe(q.choices.length);
    expect(el.querySelector('.reveal')).toBeNull();
  });

  it('emits the chosen index', () => {
    const fixture = render(generateQuestion('rec:h1', 7));
    const picked: number[] = [];
    fixture.componentInstance.choose.subscribe((i) => picked.push(i));
    (fixture.nativeElement.querySelectorAll('.choice')[2] as HTMLButtonElement).click();
    expect(picked).toEqual([2]);
  });

  it('hides the template line until answered, then reveals it with the explanation', () => {
    const q = generateQuestion('cloze:bfs:1', 3);
    const hidden = render(q).componentInstance.codeLines();
    expect(hidden[q.code!.blank!]).toContain('?');
    TestBed.resetTestingModule();

    const answered = render(q, q.answer);
    expect(answered.componentInstance.codeLines()[q.code!.blank!]).toBe(q.code!.lines[q.code!.blank!]);
    const el: HTMLElement = answered.nativeElement;
    expect(el.querySelector('.reveal.ok')).not.toBeNull();
    expect(el.querySelectorAll('.choice.right').length).toBe(1);
  });

  it('sets cloze choices as code, which keeps the mono font from drawing ligatures', () => {
    const q = generateQuestion('cloze:bfs:1', 3);
    const el: HTMLElement = render(q).nativeElement;
    expect(Array.from(el.querySelectorAll('.choices.mono .choice .text code'), (code) => code.textContent)).toEqual(q.choices);
  });

  it('marks a wrong answer', () => {
    const q = generateQuestion('rec:tp1', 11);
    const wrong = (q.answer + 1) % q.choices.length;
    const el: HTMLElement = render(q, wrong).nativeElement;
    expect(el.querySelector('.choice.wrong')).not.toBeNull();
    expect(el.querySelector('.reveal.ok')).toBeNull();
  });
});
