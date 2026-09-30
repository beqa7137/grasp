import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EMPTY_STAR_DRAFT, type StarDraft, type Story } from '@grasp/engine';
import { StoryBankService } from '../behavioral/story-bank.service';
import { BehavioralAnswerComponent } from './behavioral-answer.component';

const story = (id: string, title: string, competencyIds: string[], action: string): Story => ({
  id,
  title,
  competencyIds,
  draft: { ...EMPTY_STAR_DRAFT, situation: 'The billing export failed.', action },
  updatedAt: '2026-09-29T00:00:00Z',
});

function render(mode: 'ai' | 'offline' = 'ai') {
  const stories = [
    story('a', 'The billing export', ['ownership'], 'I rotated the credential.'),
    story('b', 'An empty one', ['ownership'], ''),
    story('c', 'The launch date', ['conflict'], 'I brought the data.'),
  ].map((s, i) => (i === 1 ? { ...s, draft: { ...EMPTY_STAR_DRAFT } } : s));
  const bank = {
    load: vi.fn(async () => undefined),
    tagged: (id: string) => stories.filter((s) => s.competencyIds.includes(id)),
  };
  TestBed.configureTestingModule({ providers: [{ provide: StoryBankService, useValue: bank }] });
  const fixture = TestBed.createComponent(BehavioralAnswerComponent);
  const draft = signal<StarDraft>({ ...EMPTY_STAR_DRAFT });
  fixture.componentRef.setInput('competencyId', 'ownership');
  fixture.componentRef.setInput('mode', mode);
  fixture.componentRef.setInput('draft', draft());
  const component = fixture.componentInstance;
  component.draft.subscribe((value) => {
    draft.set(value);
    fixture.componentRef.setInput('draft', value);
  });
  const given = vi.fn();
  component.give.subscribe(given);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const button = (name: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined;
  return { fixture, component, el, button, given, draft, bank };
}

describe('BehavioralAnswerComponent', () => {
  it('offers the stories tagged with the competency that have something written, while the answer is empty', () => {
    const { el, button } = render();
    const chips = [...el.querySelectorAll('.starters button')].map((b) => b.textContent?.trim());
    expect(chips).toEqual(['The billing export']);
    expect(button('Give answer')!.disabled).toBe(true);
  });

  it('fills the answer from a story, marks it as started from one, and hides the chips', () => {
    const { fixture, component, el, button, draft } = render();
    button('The billing export')!.click();
    fixture.detectChanges();
    expect(draft().action).toBe('I rotated the credential.');
    expect(component.fromStory()).toBe(true);
    expect(el.querySelectorAll('.starters button')).toHaveLength(0);
    expect((el.querySelector('textarea[aria-label="Action"]') as HTMLTextAreaElement).value).toBe('I rotated the credential.');
  });

  it('shows how long the answer takes to say and sends nothing until Give answer is tapped', () => {
    const { fixture, el, button, given } = render();
    const action = el.querySelector('textarea[aria-label="Action"]') as HTMLTextAreaElement;
    action.value = Array.from({ length: 150 }, () => 'word').join(' ');
    action.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.querySelector('.length')?.textContent).toContain('1:00 to say aloud');
    expect(given).not.toHaveBeenCalled();
    button('Give answer')!.click();
    expect(given).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('Sent to the AI service when you give your answer. Leave out names and confidential details.');
  });

  it('forgets the story it started from once the answer is cleared', () => {
    const { fixture, component, el, button } = render();
    button('The billing export')!.click();
    fixture.detectChanges();
    for (const field of el.querySelectorAll('textarea')) {
      (field as HTMLTextAreaElement).value = '';
      field.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();
    expect(component.fromStory()).toBe(false);
  });

  it('holds back an answer over the limit and says by how much', () => {
    const { fixture, el, button } = render();
    const fill = (label: string, length: number) => {
      const field = el.querySelector(`textarea[aria-label="${label}"]`) as HTMLTextAreaElement;
      field.value = 'x'.repeat(length);
      field.dispatchEvent(new Event('input'));
    };
    for (const label of ['Situation', 'Task', 'Action']) fill(label, 4_000);
    fixture.detectChanges();
    expect(button('Give answer')!.disabled).toBe(false);
    fill('Result', 1_234);
    fixture.detectChanges();
    expect(button('Give answer')!.disabled).toBe(true);
    expect(el.querySelector('.over')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '1,234 characters over the 12,000 an answer can hold. Shorten it to give it.',
    );
  });

  it('says the answer goes to the AI service only in an AI interview, and gives each instance its own ids', () => {
    const ai = render();
    expect(ai.el.querySelector('.note')?.textContent).toContain('Sent to the AI service');
    const scripted = TestBed.createComponent(BehavioralAnswerComponent);
    scripted.componentRef.setInput('competencyId', 'ownership');
    scripted.componentRef.setInput('draft', { ...EMPTY_STAR_DRAFT });
    scripted.componentRef.setInput('mode', 'offline');
    scripted.detectChanges();
    const note = (scripted.nativeElement as HTMLElement).querySelector('.note')?.textContent;
    expect(note).not.toContain('Sent to the AI service');
    expect(note).toContain('not sent to the AI service');
    expect(ai.el.querySelector('h2')?.id).not.toBe((scripted.nativeElement as HTMLElement).querySelector('h2')?.id);
  });
});
