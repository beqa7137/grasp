import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationStart, Router, provideRouter } from '@angular/router';
import { NavController } from '@ionic/angular';
import { CrossSections, forgetOnChange } from './cross-link.directive';

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

describe('CrossSections', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'today', component: Blank },
          { path: 'coding/problems/:id', component: Blank },
          {
            path: 'coding/patterns/:id',
            component: Blank,
            children: [
              { path: '', component: Blank },
              { path: 'problems', component: Blank },
            ],
          },
          { path: 'coding', component: Blank, children: [{ path: '', component: Blank }] },
        ]),
      ],
    });
    return { router: TestBed.inject(Router), sections: TestBed.inject(CrossSections) };
  }

  it("keeps a view's origin when its URL is replaced within its tab, as a pattern hub's segment switch does", async () => {
    const { router, sections } = setup();
    await router.navigateByUrl('/today');
    await router.navigateByUrl('/coding/patterns/hashing', { state: { from: '/today' } });
    expect(sections.from()).toBe('/today');
    await router.navigateByUrl('/coding/patterns/hashing/problems', { replaceUrl: true });
    expect(sections.from()).toBe('/today');
    await router.navigateByUrl('/coding/problems/two-sum');
    expect(sections.from()).toBeNull();
  });

  it('keeps no origin for a history move or a root navigation, which the router and Ionic also mark as replacing', async () => {
    const { router, sections } = setup();
    const nav = TestBed.inject(NavController);
    await router.navigateByUrl('/today');
    await router.navigateByUrl('/coding/patterns/hashing', { state: { from: '/today' } });
    await nav.navigateRoot('/coding/problems/two-sum', { replaceUrl: true });
    expect(sections.from()).toBeNull();
    await router.navigateByUrl('/coding/patterns/hashing', { state: { from: '/today' } });
    await nav.navigateBack('/coding/problems/two-sum', { replaceUrl: true });
    expect(sections.from()).toBeNull();
  });

  it('counts a pattern hub as a page above its tab, so the tab still returns to where the learner left it', async () => {
    const { router, sections } = setup();
    await router.navigateByUrl('/coding');
    await router.navigateByUrl('/today');
    await router.navigateByUrl('/coding/patterns/hashing', { state: { from: '/today' } });
    expect(sections.lastUrl('coding')).toBe('/coding');
  });
});
