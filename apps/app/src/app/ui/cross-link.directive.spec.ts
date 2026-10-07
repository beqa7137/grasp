import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationStart, Router, provideRouter } from '@angular/router';
import { NavController } from '@ionic/angular';
import { type CrossSections, forgetOnChange } from './cross-link.directive';

@Component({ template: '' })
class Blank {}

describe('forgetOnChange', () => {
  function setup(identity: () => string) {
    const sections = { forget: vi.fn() };
    TestBed.runInInjectionContext(() => forgetOnChange(sections as unknown as CrossSections, identity));
    TestBed.tick();
    return sections;
  }

  it("keeps the tabs' places when a renewed session reports the same learner, and forgets them when the learner changes", () => {
    const user = signal<{ id: string } | null>({ id: 'learner-1' });
    const sections = setup(() => user()?.id ?? '');
    expect(sections.forget).not.toHaveBeenCalled();

    user.set({ id: 'learner-1' });
    TestBed.tick();
    expect(sections.forget).not.toHaveBeenCalled();

    user.set(null);
    TestBed.tick();
    expect(sections.forget).toHaveBeenCalledOnce();
  });
});

describe('NavController', () => {
  // CrossSections reads this private field to tell a pop from a link; an Ionic upgrade that renames it must fail here.
  it('holds "back" in `direction` when a back navigation starts', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', component: Blank }])] });
    const router = TestBed.inject(Router);
    const nav = TestBed.inject(NavController);
    const seen: unknown[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) seen.push((nav as unknown as { direction: unknown }).direction);
    });
    await nav.navigateBack('/somewhere');
    expect(seen).toEqual(['back']);
  });
});
