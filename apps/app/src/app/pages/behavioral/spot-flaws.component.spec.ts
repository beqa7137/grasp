import { TestBed } from '@angular/core/testing';
import type { WeakExample } from '@grasp/engine';
import { SpotFlawsComponent } from './spot-flaws.component';

const example: WeakExample = {
  questionId: 'ownership-2',
  situation: 'The team had a flaky deploy pipeline that failed about once a week.',
  task: 'We needed to make the deploys reliable before the next release window.',
  action: 'We looked into the logs, we found a race in the cache warmup and we fixed it together.',
  result: 'Deploys were much more reliable after that and everyone was happier.',
  reflection: '',
  flaws: ['we-not-i', 'no-result'],
  why: { 'we-not-i': 'Every step is "we".', 'no-result': '"Much more reliable" has no number.' },
  fix: 'Say which step you took and how often deploys failed before and after.',
};

function render() {
  const fixture = TestBed.createComponent(SpotFlawsComponent);
  fixture.componentRef.setInput('example', example);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const box = (label: RegExp) =>
    [...el.querySelectorAll('label')].find((l) => label.test(l.textContent ?? ''))!.querySelector('input') as HTMLInputElement;
  const button = (name: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement;
  return { fixture, el, box, button };
}

describe('SpotFlawsComponent', () => {
  it('cannot be checked before a problem is picked', () => {
    const { button } = render();
    expect(button('Check').disabled).toBe(true);
  });

  it('scores found, missed and wrongly flagged problems, explains each and shows the fix', () => {
    const { fixture, el, box, button } = render();
    box(/Says "we"/).click();
    box(/Blames others/).click();
    fixture.detectChanges();
    button('Check').click();
    fixture.detectChanges();

    expect(el.querySelector('[role="status"]')!.textContent).toContain('You found 1 of 2 problems, and flagged 1 that is fine here.');
    const verdicts = Object.fromEntries(
      [...el.querySelectorAll('label[data-verdict]')].map((l) => [l.getAttribute('data-verdict'), l.textContent!.trim()]),
    );
    expect(verdicts['found']).toContain('Every step is "we".');
    expect(verdicts['missed']).toContain('Missed: "Much more reliable" has no number.');
    expect(verdicts['wrong']).toContain('Not a problem in this answer.');
    expect(el.textContent).toContain(example.fix);
    expect(box(/Says "we"/).disabled).toBe(true);

    button('Try again').click();
    fixture.detectChanges();
    expect(box(/Says "we"/).checked).toBe(false);
    expect(el.querySelector('[role="status"]')).toBeNull();
  });
});
