import { ApplicationRef, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { cellSearch, cellSearchCheckpoint, getCaseStudy, quadtree, quadtreeCheckpoint } from '@grasp/engine';
import { CaseStageComponent } from '../case-stage.component';
import { CellsWidgetComponent } from './cells-widget.component';
import { QuadtreeWidgetComponent } from './quadtree-widget.component';

function mount<T>(component: Type<T>) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const click = (selector: string, text: string) => {
    const button = [...el.querySelectorAll<HTMLButtonElement>(selector)].find((b) => b.textContent!.trim() === text);
    if (!button) throw new Error(`No ${selector} reading ${text}`);
    button.click();
    fixture.detectChanges();
  };
  const readout = (name: string) =>
    [...el.querySelectorAll('.readouts div')]
      .find((d) => d.querySelector('dt')!.textContent!.trim() === name)
      ?.querySelector('dd')!
      .textContent!.trim();
  const answer = (index: number) => {
    el.querySelectorAll<HTMLButtonElement>('app-widget-check fieldset button')[index].click();
    fixture.detectChanges();
  };
  const slide = (value: number) => {
    const input = el.querySelector<HTMLInputElement>('input[type="range"]')!;
    input.value = String(value);
    input.dispatchEvent(new Event('input'));
    TestBed.inject(ApplicationRef).tick();
  };
  return { fixture, el, click, readout, answer, slide, widget: fixture.componentInstance };
}

const marks = (el: HTMLElement) => [...el.querySelectorAll('.g-answer-mark')].map((m) => m.getAttribute('aria-label'));
const legend = (el: HTMLElement) => [...el.querySelectorAll('.legend-list li')].map((li) => li.textContent!.trim());

describe('cells widget', () => {
  it("hides what the search reads until the prediction is answered, then shows the model's counts", () => {
    const { el, readout, answer, widget } = mount(CellsWidgetComponent);
    const run = cellSearch(widget.settings());
    expect(readout('Within the radius')).toBe(String(run.within));
    expect(readout('Found')).toBeUndefined();
    expect(el.querySelector('.cross')).toBeNull();
    expect(legend(el)).toEqual(["The user's cell", 'Radius', 'The user', 'A place']);
    answer(cellSearchCheckpoint(widget.settings()).answer);
    expect(marks(el)).toEqual(['your answer, correct']);
    expect(readout('Places read')).toBe(String(run.read));
    expect(readout('Found')).toBe(String(run.found));
    expect(readout('Missed')).toBe(String(run.missed));
    expect(el.querySelector('.cross')!.getAttribute('d')).not.toBe('');
    expect(legend(el)).toContain('Missed (cross)');
  });

  it('asks again on a new precision or scope, and keeps the answer while the radius slides', () => {
    const { click, readout, answer, slide, widget } = mount(CellsWidgetComponent);
    const asked = widget.check();
    answer(asked.answer);
    slide(0.3);
    expect(widget.chosen()).toBe(asked.answer);
    expect(widget.shownCheck()).toBe(asked);
    expect(readout('Found')).toBe(String(cellSearch({ precision: 6, radiusKm: 0.3, scope: 'own' }).found));
    click('[role="radio"]', 'The cell and its 8 neighbours');
    expect(widget.chosen()).toBeNull();
    expect(widget.check().prompt).toContain('How many places does it read');
    answer(widget.check().answer);
    expect(readout('Missed')).toBe('0');
    click('[role="radio"]', '7');
    expect(widget.chosen()).toBeNull();
    expect(widget.check().prompt).toContain('does it miss');
  });

  it('labels the map and the slider, keeps the map out of live regions, and announces once input settles', async () => {
    vi.useFakeTimers();
    try {
      const { el, fixture, slide } = mount(CellsWidgetComponent);
      const map = el.querySelector('svg.map')!;
      expect(map.getAttribute('role')).toBe('img');
      expect(map.getAttribute('aria-label')).toBe("Map of the user's cell at precision 6, with a 0.5 km circle holding 40 places");
      expect(el.querySelector('[aria-live]')).toBeNull();
      expect(el.querySelector('input[type="range"]')!.getAttribute('aria-valuetext')).toBe('500 metres');
      const status = el.querySelector('[role="status"]')!;
      await vi.advanceTimersByTimeAsync(700);
      fixture.detectChanges();
      expect(status.textContent!.trim()).toBe('');
      slide(1.2);
      slide(1.5);
      fixture.detectChanges();
      expect(el.querySelector('input[type="range"]')!.getAttribute('aria-valuetext')).toBe('1.5 kilometres');
      await vi.advanceTimersByTimeAsync(700);
      fixture.detectChanges();
      expect(status.textContent).toContain("Precision 6, the user's cell only, 1.5 km:");
      expect(status.textContent).toContain('Answer the prediction to see what the search reads.');
      expect(el.querySelector('[role="status"]')).toBe(status);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('quadtree widget', () => {
  it('hides depth, nodes and query work until answered, then shows what the model gives', () => {
    const { el, readout, answer, widget } = mount(QuadtreeWidgetComponent);
    expect(el.querySelector('.readouts')).toBeNull();
    expect(el.querySelector('svg.map')!.getAttribute('aria-label')).toBe(
      'Quadtree leaves over 10,000 places around one city, at most 100 a leaf',
    );
    answer(quadtreeCheckpoint(widget.settings()).answer);
    expect(marks(el)).toEqual(['your answer, correct']);
    const run = quadtree(widget.settings());
    expect(readout('Deepest leaf')).toBe(`${run.depth} levels`);
    expect(readout('Nodes')).toBe(String(run.nodes));
    expect(readout('Places checked a query')).toBe(String(Math.round(run.examined)));
    expect(readout('Memory at 200 million')).toBe('6.9 GB');
    expect(el.querySelector('.leaves')!.getAttribute('d')!.match(/M/g)).toHaveLength(run.leaves.length);
  });

  it('keeps the answer while the capacity slides, and asks again for a new pattern', () => {
    const { click, readout, answer, slide, widget } = mount(QuadtreeWidgetComponent);
    const asked = widget.check();
    answer(asked.answer);
    slide(5);
    expect(widget.chosen()).toBe(asked.answer);
    expect(readout('Nodes')).toBe(quadtree({ capacity: 5, density: 'city' }).nodes.toLocaleString('en-US'));
    click('[role="radio"]', 'Even');
    expect(widget.chosen()).toBeNull();
    expect(widget.check().prompt).toContain('spread evenly, at most 5 a leaf');
  });

  it('labels its slider with units and announces one summary once input settles', async () => {
    vi.useFakeTimers();
    try {
      const { el, fixture, slide } = mount(QuadtreeWidgetComponent);
      expect(el.querySelector('input[type="range"]')!.getAttribute('aria-valuetext')).toBe('100 places a leaf');
      expect(el.querySelector('[aria-live]')).toBeNull();
      const status = el.querySelector('[role="status"]')!;
      await vi.advanceTimersByTimeAsync(700);
      fixture.detectChanges();
      expect(status.textContent!.trim()).toBe('');
      for (const v of [80, 60, 40]) slide(v);
      await vi.advanceTimersByTimeAsync(700);
      fixture.detectChanges();
      expect(status.textContent!.trim()).toBe('10,000 places around one city, at most 40 a leaf. Answer the prediction to see the tree.');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a proximity stage with a widget', () => {
  it('opens the cell model only after the decision is answered', async () => {
    const stage = getCaseStudy('proximity-service')!.stages.find((s) => s.widget === 'cells')!;
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(CaseStageComponent);
    fixture.componentRef.setInput('stage', stage);
    fixture.componentRef.setInput('caseId', 'proximity-service');
    fixture.componentRef.setInput('orderSeed', 'proximity-service:attempt-1:6');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-cells-widget')).toBeNull();
    el.querySelector<HTMLButtonElement>('fieldset button')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('section.widget h3')!.textContent).toBe('Try it: search geohash cells around a user');
    expect(el.querySelector('app-cells-widget')).not.toBeNull();
  });
});
