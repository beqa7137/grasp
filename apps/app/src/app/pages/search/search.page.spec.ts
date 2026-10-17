import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { Story } from '@grasp/engine';
import { StoryBankService } from '../behavioral/story-bank.service';
import { SearchPage } from './search.page';

function setup(q: string, kind?: string, stories: Partial<Story>[] = []) {
  TestBed.configureTestingModule({
    imports: [SearchPage],
    providers: [
      provideRouter([]),
      { provide: StoryBankService, useValue: { load: vi.fn(async () => undefined), stories: signal(stories) } },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(SearchPage);
  fixture.componentRef.setInput('q', q);
  if (kind) fixture.componentRef.setInput('kind', kind);
  fixture.detectChanges();
  const host: HTMLElement = fixture.nativeElement;
  const text = (selector: string) => [...host.querySelectorAll(selector)].map((e) => e.textContent!.replace(/\s+/g, ' ').trim());
  return { fixture, host, text, navigate, page: fixture.componentInstance };
}

describe('SearchPage', () => {
  it('lists the rate limiter journey under System design, with kind chips and links', () => {
    const { text, host } = setup('rate');
    expect(text('h2')).toEqual(['System design']);
    expect(text('h3')).toEqual(['Topics', 'Cases', 'Mock rounds', 'Missions']);
    expect(text('.kinds button')).toEqual(['Topics 2', 'Missions 1', 'Cases 4', 'Mock rounds 1']);
    const hrefs = [...host.querySelectorAll('a[g-entry-row]')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/design/topics/sd-rate-limiting',
        '/design/missions/bot-storm',
        '/design/cases/rate-limiter',
        '/mock?round=rate-limiter',
      ]),
    );
    expect(text('[role="status"]')).toEqual(['8 results']);
  });

  it('shows eight of a kind with See all, which narrows the URL to that kind', () => {
    const { host, navigate } = setup('binary search');
    const all = [...host.querySelectorAll<HTMLButtonElement>('button.all')].find((b) => b.textContent!.includes('problems'))!;
    expect(all.textContent!.trim()).toMatch(/^See all \d+ problems →$/);
    all.click();
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { q: 'binary search', kind: 'problem' }, replaceUrl: true }),
    );
  });

  it('shows every hit of the chosen kinds', () => {
    const { host, text } = setup('binary search', 'problem');
    expect(text('h3')).toEqual(['Problems']);
    expect(host.querySelectorAll('a[g-entry-row]').length).toBeGreaterThan(8);
    expect(host.querySelector('button.all')).toBeNull();
    expect(text('[role="status"]')[0]).toMatch(/^\d+ of \d+ results$/);
  });

  it("searches the learner's stories on the device, as their own group", () => {
    const { text, host } = setup('migration', undefined, [{ id: 's1', title: 'The billing migration' }]);
    expect(text('h3')).toContain('Stories');
    expect(host.querySelector('a[href="/behavioral/stories/s1"]')).not.toBeNull();
  });

  it('offers the closest title when nothing matches', () => {
    const { host, navigate } = setup('rate limter');
    expect(host.querySelector('g-empty-state')?.textContent).toContain('Did you mean Rate Limiter?');
    host.querySelector<HTMLButtonElement>('g-empty-state button')!.click();
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { q: 'Rate Limiter', kind: null } }));
  });

  it('says what it searches before anything is typed', () => {
    const { host } = setup('');
    expect(host.querySelector('.hint')?.textContent).toContain('and your stories');
    expect(host.querySelectorAll('h2')).toHaveLength(0);
  });
});
