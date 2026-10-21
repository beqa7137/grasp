import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { getCodingProblem } from '@grasp/engine';
import { HintLadderComponent } from './hint-ladder.component';

function setup(problemId: string, shown: number, patternId?: string) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(HintLadderComponent);
  const problem = getCodingProblem(problemId)!;
  fixture.componentRef.setInput('problem', problem);
  fixture.componentRef.setInput('patternId', patternId ?? problem.patternIds[0]);
  fixture.componentRef.setInput('shown', shown);
  const revealed: number[] = [];
  fixture.componentRef.setInput('reveal', (rung: number) => revealed.push(rung));
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, revealed, text: () => el.textContent!.replace(/\s+/g, ' ').trim() };
}

describe('HintLadderComponent', () => {
  it('offers one rung at a time, starting with the pattern', () => {
    const { el, revealed } = setup('search-rotated-array', 0);
    const buttons = [...el.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent!.trim())).toEqual(['Which pattern?']);
    buttons[0].click();
    expect(revealed).toEqual([1]);
  });

  it("quotes the statement's cue words, lists the cues they echo, then shows the template and the visualizer", () => {
    const { text, el } = setup('search-rotated-array', 3);
    expect(text()).toContain('The pattern: Binary Search.');
    expect(text()).toContain('“sorted” and “rotated” in the statement are cues for Binary Search:');
    expect([...el.querySelectorAll('ul li')].map((li) => li.textContent!.trim())).toEqual(['Sorted input', 'Rotated sorted array']);
    expect(el.querySelector('g-code-panel')).not.toBeNull();
    const watch = el.querySelector<HTMLAnchorElement>('a.g-btn')!;
    expect(watch.textContent!.trim()).toBe('Watch it: Binary Search →');
    expect(watch.getAttribute('href')).toBe('/coding/visualizers/binary-search');
  });

  it("falls back to all of the pattern's cues when no word of the statement names one, and names its other patterns", () => {
    const { text } = setup('partition-labels', 2);
    expect(text()).toContain("No word in the statement names a cue outright. Greedy's cues:");
    const shared = setup('container-most-water', 1);
    expect(shared.text()).toContain('The pattern: Two Pointers (also Greedy).');
    const fromGreedy = setup('container-most-water', 1, 'greedy');
    expect(fromGreedy.text()).toContain('The pattern: Greedy (also Two Pointers).');
  });
});
