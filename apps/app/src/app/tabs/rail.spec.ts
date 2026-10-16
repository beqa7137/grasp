import { CODING_CATALOG } from '@grasp/engine';
import { routes } from '../app.routes';
import { RAIL_SECTIONS, RAIL_UTILITIES, railCurrent } from './rail';
import { daysLeft, problemsSolved } from './rail-counts';

const tabRoutes = routes[0].children!;

describe('the desktop rail', () => {
  it('has one section per tab, and its sub-items are the hub segments, in order and with their titles', () => {
    expect(RAIL_SECTIONS.map((s) => s.tab)).toEqual(['today', 'coding', 'design', 'behavioral', 'mock']);
    for (const section of RAIL_SECTIONS) {
      const hub = tabRoutes.find((r) => r.path === section.tab)!;
      expect(section.label).toBe(hub.title);
      const segments = (hub.children ?? []).map((c) => ({
        label: c.title,
        href: c.path ? `/${section.tab}/${c.path}` : `/${section.tab}`,
      }));
      expect(section.subs).toEqual(segments);
    }
  });

  it('opens utilities that are routes of the Today stack', () => {
    for (const u of RAIL_UTILITIES) {
      expect(u.href.startsWith('/today/')).toBe(true);
      expect(tabRoutes.some((r) => `/${r.path}` === u.href)).toBe(true);
    }
  });

  it("marks a section's own page, and a sub-item rather than its section on the hub's root", () => {
    expect(railCurrent('/today')).toEqual({ item: null, section: { tab: 'today', current: 'page' } });
    expect(railCurrent('/mock')).toEqual({ item: null, section: { tab: 'mock', current: 'page' } });
    expect(railCurrent('/coding')).toEqual({ item: '/coding', section: { tab: 'coding', current: 'true' } });
    expect(railCurrent('/design/cases')).toEqual({ item: '/design/cases', section: { tab: 'design', current: 'true' } });
  });

  it('marks the section of a page that is none of its items, and ignores the query', () => {
    expect(railCurrent('/design/cases/url-shortener')).toEqual({ item: null, section: { tab: 'design', current: 'true' } });
    expect(railCurrent('/coding/problems?track=foundations')).toEqual({
      item: '/coding/problems',
      section: { tab: 'coding', current: 'true' },
    });
    expect(railCurrent('/today/review')).toEqual({ item: null, section: { tab: 'today', current: 'true' } });
  });

  it('marks a utility page alone, and nothing outside the sections', () => {
    expect(railCurrent('/today/settings')).toEqual({ item: '/today/settings', section: null });
    expect(railCurrent('/today/plan#top')).toEqual({ item: '/today/plan', section: null });
    expect(railCurrent('/')).toEqual({ item: null, section: null });
  });

  it('counts the days left as Today words it, and nothing once the date has passed', () => {
    expect(daysLeft('2026-10-25', '2026-10-02')).toBe('23 days left');
    expect(daysLeft('2026-10-03', '2026-10-02')).toBe('interview tomorrow');
    expect(daysLeft('2026-10-02', '2026-10-02')).toBe('interview today');
    expect(daysLeft('2026-10-01', '2026-10-02')).toBeNull();
  });

  it('counts solved problems of every problem, ignoring attempts and unknown ids', () => {
    const at = '2026-10-01T10:00:00.000Z';
    const record = (solvedAt: string | null) => ({ solvedAt, lastAt: at, bestPassed: 1, total: 3 }) as never;
    expect(problemsSolved({ 'two-sum': record(at), 'three-sum': record(null), retired: record(at) })).toBe(`1/${CODING_CATALOG.length}`);
  });
});
