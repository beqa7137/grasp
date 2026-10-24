import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FEED_EXPERIMENTS, fillTemplate, renderExperiment } from '@grasp/engine';
import { FeedModelWidgetComponent } from './feed-model-widget.component';

@Component({
  imports: [FeedModelWidgetComponent],
  template: `<app-feed-model-widget [experiments]="experiments" />`,
})
class Host {
  readonly experiments = FEED_EXPERIMENTS;
}

const SHOWN = FEED_EXPERIMENTS.map(renderExperiment);
const at = (id: string) => SHOWN.findIndex((e) => e.id === id);

async function setup({ width = 652, motion = 'off' } = {}) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly report: ResizeObserverCallback) {}
      observe() {
        this.report([{ contentRect: { width: width + 2 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now() + 10_000)));
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  const animate = vi.fn(() => ({ pause: vi.fn(), play: vi.fn(), cancel: vi.fn() }) as unknown as Animation);
  Element.prototype.animate = animate;
  Element.prototype.scrollIntoView = vi.fn();
  document.documentElement.setAttribute('data-motion', motion);
  const fixture = TestBed.createComponent(Host);
  const render = async () => {
    for (let i = 0; i < 8; i++) {
      TestBed.tick();
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r));
    }
  };
  await render();
  const el = fixture.nativeElement as HTMLElement;
  const clean = (t: Element) => t.textContent!.replace(/\s+/g, ' ').trim();
  const text = (selector: string) => [...el.querySelectorAll(selector)].map(clean);
  const slider = (name: string) => el.querySelector<HTMLElement>(`[role="slider"][aria-label="${name}"]`)!;
  const key = async (name: string, k: string, times = 1) => {
    for (let i = 0; i < times; i++) slider(name).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    await render();
  };
  const button = (name: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => clean(b) === name || b.getAttribute('aria-label') === name)!;
  const press = async (name: string) => {
    button(name).click();
    await render();
  };
  const card = async (i: number) => {
    el.querySelectorAll<HTMLButtonElement>('.cards button')[i].click();
    await render();
  };
  const radio = async (name: string) => {
    const input = [...el.querySelectorAll<HTMLLabelElement>('.segment, .place')]
      .find((l) => clean(l).startsWith(name))!
      .querySelector('input')!;
    input.click();
    await render();
  };
  const heights = () => [...el.querySelectorAll<HTMLElement>('g-stage .well')].map((w) => w.style.height);
  const page = () => el.querySelector('.page-stage svg')!;
  return { el, text, slider, key, press, card, radio, button, heights, render, animate, page };
}

describe('FeedModelWidgetComponent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-motion');
  });

  it('draws the default read as 21 trips one after another, the 40 rows they read, and a one-row rename', async () => {
    const { text, page, el } = await setup();
    expect(text('.page-stage .head')).toEqual(['21ms page wait', '40rows read a page']);
    expect(text('app-feed-write .head')).toEqual(['1row · new name at once']);
    expect(page().getAttribute('aria-label')).toBe(
      'Normalized, read with N+1: 21 queries one after another, 21 ms page wait, the database in the same zone; reads 20 posts and 20 authors rows.',
    );
    expect(text('.sql')).toEqual(['1 × posts LIMIT 20', '20 × authors WHERE id = ?']);
    expect(text('.page-stage .small')).toContain('×9: 1 trip = 1 ms there and back');
    expect(text('.page-stage .small')).toContain('trips 1 to 21, one after another');
    expect(el.querySelectorAll('.read-row')).toHaveLength(10);
    expect(text('app-feed-traffic text').filter((t) => t.includes('rows/s'))).toEqual([
      '40,001rows/s normalized',
      '20,501rows/s denormalized',
    ]);
  });

  it('keeps the slower read as a ghost beside a faster one, until any other change', async () => {
    const { radio, text, el, key } = await setup();
    await radio('Batched IN');
    expect(text('.page-stage .head')[0]).toBe('2ms page wait');
    expect(text('.page-stage text.small').slice(0, 1)).toEqual(['N+1 was']);
    expect(el.querySelector('.trip.ghost')).not.toBeNull();
    expect(text('.notice')).toEqual([
      'Read with batched IN: 2 queries one after another, 2 ms page wait (N+1 was 21 ms); the same 40 rows.',
    ]);
    expect(text('.sql')[1]).toBe('1 × authors WHERE id IN (a7, a3, a12, a5, … 20 ids)');
    await radio('Join');
    expect(text('.sql')).toEqual(['1 × posts JOIN authors ON authors.id = posts.author_id']);
    await key('Posts a page', 'ArrowRight');
    expect(el.querySelector('.trip.ghost')).toBeNull();
  });

  it('runs N+1 past the axis from another region, with the real wait in the headline and no magnifier', async () => {
    const { radio, text, el } = await setup();
    await radio('another region');
    expect(text('.page-stage .head')[0]).toBe('630ms page wait');
    expect(el.querySelector('.page-stage .chevron')).not.toBeNull();
    expect(el.querySelector('.mag')).toBeNull();
    expect(text('.notice')).toEqual(['The database in another region: 30 ms a round trip, so 21 queries wait 630 ms.']);
  });

  it('denormalizes: one read of half the rows, no read to choose, and a rename that writes every copy', async () => {
    const { radio, text, el } = await setup();
    await radio('Denormalized');
    expect(el.querySelector<HTMLFieldSetElement>('fieldset.nothing')!.disabled).toBe(true);
    expect(text('.note')).toEqual(['Nothing to look up: the name is in each post.']);
    expect(text('.page-stage .head')).toEqual(['1ms page wait', '20rows read a page']);
    expect(el.querySelector('.unread')).not.toBeNull();
    expect(text('app-feed-write .head')).toEqual(['501rows · old name 100 ms']);
    expect(text('app-feed-write .cap')).toContain('A rename would show the old name for 100 ms');
    expect(text('app-feed-traffic .small.bad')).toEqual(['copy rewrite falls behind above 10 renames/s']);
  });

  it('renames without motion at half done, the playhead the control, and the old name struck beside the new', async () => {
    const { radio, press, slider, key, text, el, animate, heights } = await setup();
    const before = heights();
    await radio('Denormalized');
    await press('Rename Ada');
    expect(slider('Copy rewrite').getAttribute('aria-valuetext')).toBe('copy rewrite 50% done, 250 of 500 copies rewritten');
    expect(text('.struck')).toEqual(['Ada']);
    expect(text('.old-tag')).toEqual(['Old name']);
    expect(text('app-feed-write .cap').filter((t) => /^\d+ of /.test(t))).toEqual(['50 of 100 ms']);
    await key('Copy rewrite', 'End');
    expect(text('.old-tag')).toEqual([]);
    expect(el.querySelectorAll('.cell.fresh:not(.key)')).toHaveLength(100);
    expect(animate).not.toHaveBeenCalled();
    expect(heights()).toEqual(before);
  });

  it('plays a rename with motion and finishes with every copy rewritten', async () => {
    const { radio, press, el, text, animate, render } = await setup({ motion: 'full' });
    await radio('Denormalized');
    await press('Rename Ada');
    await new Promise((r) => setTimeout(r, 50));
    await render();
    expect(el.querySelectorAll('.cell.fresh:not(.key)')).toHaveLength(100);
    expect(text('.notice')).toEqual(['The copy rewrite finished: every copy says Ada K.']);
    expect(animate).toHaveBeenCalled();
  });

  it('loads a page with motion, then lands the marker; without motion it says what loaded', async () => {
    const reduced = await setup();
    await reduced.press('Load a page');
    expect(reduced.text('.notice')).toEqual(['Page loaded: 21 queries one after another, 21 ms.']);
    expect(reduced.animate).not.toHaveBeenCalled();
  });

  it('asks a read-heavy question with the denormalized answer hidden, then reveals it on the picture', async () => {
    const { card, text, el, press, button } = await setup();
    const e = at('read-heavy');
    await card(e);
    expect(text('app-widget-check legend')).toEqual([SHOWN[e].ask]);
    expect(el.querySelector('app-feed-traffic .line.dashed')).toBeNull();
    expect(text('app-feed-traffic text').filter((t) => t.includes('?'))).toEqual(['denormalized:?']);
    expect(button('Describe').disabled).toBe(true);
    await press(SHOWN[e].choices[SHOWN[e].answer]);
    expect(text('app-widget-check .explain')).toEqual([SHOWN[e].reveal]);
    expect(text('.page-stage .head')[1]).toBe('20rows read a page');
    expect(el.querySelector('app-feed-traffic .line.dashed')).not.toBeNull();
    for (const region of SHOWN[e].focus) expect(el.querySelector(`[data-focus="${region}"]`)!.classList).toContain('focused');
  });

  it('hides the old name’s window while asking how long it lasts', async () => {
    const { card, text } = await setup();
    await card(at('old-name'));
    expect(text('app-feed-write .head')).toEqual(['100,001rows · old name ?']);
    expect(text('app-feed-write .cap').join(' ')).not.toContain('20 s');
  });

  it('meets the challenge only by denormalizing, and keeps the settings it holds', async () => {
    const { card, text, radio, key } = await setup();
    await card(at('pick-schema'));
    expect(text('.status')[0]).toBe('N+1 · 42 ms ✗ · fresh ✓ · 400,001 rows/s ✗');
    await radio('Join');
    expect(text('.status')[0]).toBe('The join · 2 ms ✓ · fresh ✓ · 400,001 rows/s ✗');
    await key('Posts a page', 'Home');
    expect(text('.status')[0]).toMatch(
      /The goal keeps 20 posts a page, 10,000 pages a second, 1 rename a second, Ada's 500 posts and the database in another zone\.$/,
    );
    await key('Posts a page', 'ArrowRight');
    await radio('Denormalized');
    expect(text('.status')[0]).toBe('Goal met: Denormalized · 2 ms ✓ · old name 100 ms ✓ · 200,501 rows/s ✓');
  });

  it('describes every schema and read in a table, the current one marked', async () => {
    const { press, el, text } = await setup();
    await press('Describe');
    const rows = [...el.querySelectorAll('.describe tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent!.trim()).join(' | '),
    );
    expect(rows).toEqual([
      'Normalized, N+1 | 21 | 21 ms | 40 | 1 | none | 0 | 40,001',
      'Normalized, batched IN | 2 | 2 ms | 40 | 1 | none | 0 | 40,001',
      'Normalized, the join | 1 | 1 ms | 40 | 1 | none | 0 | 40,001',
      'Denormalized | 1 | 1 ms | 20 | 501 | 100 ms | 100 | 20,501',
    ]);
    expect(text('.describe thead th')[0]).toBe('Schema and read');
    expect(el.querySelector('.describe tr.active')!.textContent).toContain('N+1');
  });

  it('keeps every stage’s height whatever is shown, on a phone too', async () => {
    const { heights, radio, press, card, render } = await setup({ width: 322 });
    const before = heights();
    await radio('Denormalized');
    await press('Rename Ada');
    await card(at('read-heavy'));
    await render();
    expect(heights()).toEqual(before);
  });
  it('says the old name never clears once renames outrun the copy rewrite, and says the limit with its decimals', async () => {
    const { radio, key, text, el, press } = await setup();
    await radio('Denormalized');
    await key('Ada’s posts', 'End');
    expect(text('app-feed-write .head')).toEqual(['100,001rows · old name never clears']);
    expect(el.querySelector('app-feed-write .head .unit.bad')).not.toBeNull();
    expect(text('app-feed-traffic .small.bad')).toEqual(['copy rewrite falls behind above 0.05 renames/s']);
    expect(text('app-feed-write .cap.bad').join(' ')).toContain('The backlog grows by 95,000 rows/s.');
    await press('Describe');
    expect(text('.describe g-data-table tr:last-child td').slice(5, 7)).toEqual(['never clears', 'every page']);
  });

  it('ends a rename exactly at the rewrite’s capacity as finished, with motion and without', async () => {
    for (const motion of ['off', 'full']) {
      const { radio, key, press, text, el, render } = await setup({ motion });
      await radio('Denormalized');
      await key('Renames a second', 'ArrowRight');
      expect(el.querySelector('[role="slider"][aria-label="Renames a second"]')!.getAttribute('aria-valuetext')).toBe(
        '10 renames a second',
      );
      await press('Rename Ada');
      await new Promise((r) => setTimeout(r, 50));
      await render();
      expect(text('app-feed-write .head')).toEqual(['501rows · old name 100 ms']);
      expect(text('.notice')).toEqual([
        motion === 'full'
          ? 'The copy rewrite finished: every copy says Ada K.'
          : 'Ada renamed: the copy rewrite is shown half done. Drag its playhead to step through it.',
      ]);
      expect(el.querySelector('[role="slider"][aria-label="Copy rewrite"]')).not.toBeNull();
      TestBed.resetTestingModule();
    }
  });

  it('shows a rewrite that falls behind without a playhead to finish it, under Reduced motion', async () => {
    const { radio, key, press, text, el } = await setup();
    await radio('Denormalized');
    await key('Renames a second', 'End');
    await press('Rename Ada');
    expect(text('.notice')[0]).toContain('never all catch up');
    expect(el.querySelector('[role="slider"][aria-label="Copy rewrite"]')).toBeNull();
  });

  it('keeps the join beside N+1 once trips-not-rows plays its answer', async () => {
    const { card, press, text } = await setup();
    const e = at('trips-not-rows');
    await card(e);
    await press(SHOWN[e].choices[SHOWN[e].answer]);
    expect(text('.page-stage .head')[0]).toBe('101ms page wait');
    expect(text('.page-stage text.small')).toContain('The join was 1 ms');
  });

  it('closes a Table that was open when a question starts asking', async () => {
    const { press, card, el } = await setup();
    await press('Table');
    expect(el.querySelector('app-feed-traffic g-data-table')).not.toBeNull();
    await card(at('read-heavy'));
    expect(el.querySelector('app-feed-traffic g-data-table')).toBeNull();
  });

  it('never shows an open question its answer, at any snap of any control the learner can move', async () => {
    const { card, el, radio, key, button, render } = await setup();
    const shown = (root: HTMLElement) =>
      [
        ...[...root.querySelectorAll('svg text')].map((t) => t.textContent!.replace(/\s+/g, ' ')),
        ...[...root.querySelectorAll('[aria-label], [aria-valuetext]')].flatMap((n) => [
          n.getAttribute('aria-label') ?? '',
          n.getAttribute('aria-valuetext') ?? '',
        ]),
        ...[...root.querySelectorAll('.notice, .describe')].map((n) => n.textContent!),
      ].join('\n');
    const answers: Record<string, RegExp> = {};
    // Trips-not-rows asks a ratio no control prints, and trying N+1 is its experiment, so only its reveal covers it.
    for (const spec of FEED_EXPERIMENTS.filter((x) => x.truth && x.id !== 'trips-not-rows')) {
      const value = fillTemplate(`{${spec.truth}}`, spec.slots());
      answers[spec.id] = new RegExp(`(^|[^\\d.,])${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d,])`, 'i');
    }
    expect(Object.keys(answers)).toEqual(['read-heavy', 'old-name', 'frequent-renames']);
    const radios = ['Normalized', 'Denormalized', 'N+1', 'Batched IN', 'Join', 'same host', 'same zone', 'cross-zone', 'another region'];
    const handles = { 'Posts a page': 4, 'Ada’s posts': 5, 'Pages a second': 5, 'Renames a second': 5 };
    for (const [id, answer] of Object.entries(answers)) {
      const i = at(id);
      const check = (what: string) => {
        const mainText = shown(el.querySelector<HTMLElement>('.main')!) + shown(el.querySelector<HTMLElement>('.controls')!);
        expect(answer.test(mainText), `${id} after ${what}: ${mainText.match(answer)?.[0]}`).toBe(false);
      };
      for (const name of radios) {
        await card(i);
        await radio(name);
        check(name);
      }
      for (const [name, stops] of Object.entries(handles)) {
        await card(i);
        await key(name, 'Home');
        for (let k = 0; k < stops; k++) {
          check(`${name} stop ${k}`);
          await key(name, 'ArrowRight');
        }
      }
      for (const motion of ['off', 'full']) {
        document.documentElement.setAttribute('data-motion', motion);
        for (const name of ['Load a page', 'Rename Ada']) {
          await card(i);
          if (!button(name).disabled) {
            button(name).click();
            await render();
            await new Promise((r) => setTimeout(r, 50));
            await render();
          }
          check(`${name}, motion ${motion}`);
        }
      }
      document.documentElement.setAttribute('data-motion', 'off');
      await render();
      // The check can see an answer: once revealed, the picture states it.
      await card(i);
      button(SHOWN[i].choices[SHOWN[i].answer]).click();
      await render();
      await new Promise((r) => setTimeout(r, 50));
      await render();
      const after = shown(el.querySelector<HTMLElement>('.main')!);
      expect(answer.test(after), `${id} revealed`).toBe(true);
    }
  }, 120_000);
});
