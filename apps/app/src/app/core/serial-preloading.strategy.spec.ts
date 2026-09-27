import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Route } from '@angular/router';
import { EMPTY, Observable, Subject, firstValueFrom, of } from 'rxjs';
import { SerialPreloadingStrategy } from './serial-preloading.strategy';

@Component({ template: '' })
class TestPage {}

const componentRoute = (path: string): Route => ({ path, loadComponent: () => TestPage });

describe('SerialPreloadingStrategy', () => {
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
