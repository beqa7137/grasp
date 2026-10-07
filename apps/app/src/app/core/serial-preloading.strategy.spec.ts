import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Route } from '@angular/router';
import { EMPTY, Observable, Subject, firstValueFrom, of } from 'rxjs';
import { FIRST_IDLE, SerialPreloadingStrategy, firstIdle } from './serial-preloading.strategy';

@Component({ template: '' })
class TestPage {}

const componentRoute = (path: string): Route => ({ path, loadComponent: () => TestPage });

describe('SerialPreloadingStrategy', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [{ provide: FIRST_IDLE, useValue: Promise.resolve() }] }));

  it('waits for component completion despite an earlier placeholder emission', async () => {
    const strategy = TestBed.inject(SerialPreloadingStrategy);
    const loading = new Subject<string>();
    const startFirst = vi.fn(() => loading);
    const startSecond = vi.fn(() => of('second'));
    const startThird = vi.fn(() => of('third'));
    const results = [
      firstValueFrom(strategy.preload(componentRoute('first'), startFirst)),
      firstValueFrom(strategy.preload(componentRoute('second'), startSecond)),
      firstValueFrom(strategy.preload(componentRoute('third'), startThird)),
    ];

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(startFirst).toHaveBeenCalledOnce();
    expect(startSecond).not.toHaveBeenCalled();
    loading.next('placeholder');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(startSecond).not.toHaveBeenCalled();
    expect(startThird).not.toHaveBeenCalled();

    loading.next('first');
    loading.complete();
    expect(await Promise.all(results)).toEqual(['first', 'second', 'third']);
    expect(startSecond).toHaveBeenCalledOnce();
    expect(startThird).toHaveBeenCalledOnce();
    expect(startSecond.mock.invocationCallOrder[0]).toBeLessThan(startThird.mock.invocationCallOrder[0]);
  });

  it.each([
    {
      name: 'a synchronous loader failure',
      load: (): Observable<unknown> => {
        throw new Error('Unavailable chunk');
      },
    },
    {
      name: 'an asynchronous loader failure',
      load: () => new Observable((subscriber) => queueMicrotask(() => subscriber.error(new Error('Unavailable chunk')))),
    },
    { name: 'an empty loader', load: () => EMPTY },
  ])('continues after $name', async ({ load }) => {
    const strategy = TestBed.inject(SerialPreloadingStrategy);
    const first = firstValueFrom(strategy.preload(componentRoute('first'), load));
    const next = vi.fn(() => of('ready'));
    const second = firstValueFrom(strategy.preload(componentRoute('second'), next));

    expect(await Promise.all([first, second])).toEqual([null, 'ready']);
    expect(next).toHaveBeenCalledOnce();
  });

  it.each([
    { name: 'an eager route', route: { path: 'eager', component: TestPage } },
    { name: 'a redirect', route: { path: '', redirectTo: 'learn' } },
    { name: 'lazy children', route: { path: 'children', loadChildren: () => [] } },
    { name: 'a component with lazy children', route: { ...componentRoute('parent'), loadChildren: () => [] } },
  ])('skips $name without invoking its loader', async ({ route }) => {
    const load = vi.fn(() => of('loaded'));
    const result = await firstValueFrom(TestBed.inject(SerialPreloadingStrategy).preload(route, load));

    expect(result).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('loads a component whose child routes are already declared', async () => {
    const route = { ...componentRoute('parent'), children: [componentRoute('child')] };
    const load = vi.fn(() => of('parent'));

    expect(await firstValueFrom(TestBed.inject(SerialPreloadingStrategy).preload(route, load))).toBe('parent');
    expect(load).toHaveBeenCalledOnce();
  });

  it('loads ranked routes first, then in declaration order, once the first screen is idle', async () => {
    let idle!: () => void;
    TestBed.configureTestingModule({ providers: [{ provide: FIRST_IDLE, useValue: new Promise<void>((resolve) => (idle = resolve)) }] });
    const strategy = TestBed.inject(SerialPreloadingStrategy);
    const order: string[] = [];
    const ranked = (path: string, preload?: number): Route => ({ ...componentRoute(path), data: preload === undefined ? {} : { preload } });
    const results = [ranked('detail'), ranked('page', 1), ranked('hub', 0), ranked('other'), ranked('hub-two', 0)].map((route) =>
      firstValueFrom(strategy.preload(route, () => (order.push(route.path!), of(route.path)))),
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual([]);

    idle();
    await Promise.all(results);
    expect(order).toEqual(['hub', 'hub-two', 'page', 'detail', 'other']);
  });

  it('does not start queued loaders after destruction', async () => {
    const strategy = TestBed.inject(SerialPreloadingStrategy);
    const loading = new Subject<string>();
    const first = firstValueFrom(strategy.preload(componentRoute('first'), () => loading));
    const next = vi.fn(() => of('second'));
    const second = firstValueFrom(strategy.preload(componentRoute('second'), next));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    TestBed.resetTestingModule();
    loading.next('first');
    loading.complete();

    expect(await Promise.all([first, second])).toEqual(['first', null]);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('firstIdle without requestIdleCallback, as in WebKit', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function webkit(readyState: DocumentReadyState) {
    const listeners: (() => void)[] = [];
    const win = {
      document: { readyState },
      setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
      clearTimeout: (id: number) => clearTimeout(id),
      requestAnimationFrame: (fn: () => void) => setTimeout(fn, 16),
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    };
    return { win: win as unknown as Window, load: () => listeners.forEach((fn) => fn()) };
  }

  const settled = (promise: Promise<void>) => {
    let done = false;
    void promise.then(() => (done = true));
    return () => done;
  };

  it('waits for the load event and a frame', async () => {
    const { win, load } = webkit('loading');
    const done = settled(firstIdle(win));
    await vi.advanceTimersByTimeAsync(1000);
    expect(done()).toBe(false);
    load();
    await vi.advanceTimersByTimeAsync(20);
    expect(done()).toBe(true);
  });

  it('starts a frame after an already loaded page', async () => {
    const done = settled(firstIdle(webkit('complete').win));
    await vi.advanceTimersByTimeAsync(0);
    expect(done()).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    expect(done()).toBe(true);
  });

  it('gives up waiting after 5 seconds', async () => {
    const done = settled(firstIdle(webkit('loading').win));
    await vi.advanceTimersByTimeAsync(4999);
    expect(done()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done()).toBe(true);
  });
});
