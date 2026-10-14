import { TestBed } from '@angular/core/testing';
import { SkillStateComponent, type SkillGlyph } from './skill-state.component';

function render(state: SkillGlyph) {
  const fixture = TestBed.createComponent(SkillStateComponent);
  fixture.componentRef.setInput('state', state);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/** The shape drawn over the ring: nothing, a half, a disc, or a disc with a check. */
const shape = (el: HTMLElement) =>
  el.querySelector('path.check.outline')
    ? 'ring-check'
    : el.querySelector('path.check')
      ? 'check'
      : el.querySelector('path.fill')
        ? 'half'
        : el.querySelector('circle.fill')
          ? 'full'
          : 'ring';

describe('SkillStateComponent', () => {
  it('gives each state its own shape, so it reads without colour', () => {
    const shapes = (['new', 'learning', 'practiced', 'ready'] as const).map((s) => shape(render(s)));
    expect(shapes).toEqual(['ring', 'half', 'full', 'check']);
  });

  it('names its state for screen readers and hides the drawing', () => {
    const el = render('learning');
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('aria-label')).toBe('Learning');
    expect(el.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws Spotted as a ring with a check, never as Ready, and To learn as New', () => {
    expect([shape(render('spotted')), shape(render('to-learn'))]).toEqual(['ring-check', 'ring']);
    expect(render('to-learn').getAttribute('aria-label')).toBe('To learn');
  });
});
