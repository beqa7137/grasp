import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SD_TOPICS, topicUses } from '@grasp/engine';
import { ApiService } from '../../core/api.service';
import { AnnouncerService } from '../../core/announcer.service';
import { ShelvesComponent } from './shelves.component';

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async () => ({ value: null })),
    set: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    keys: vi.fn(async () => ({ keys: [] })),
  },
}));

describe('the Design hub Topics', () => {
  async function render() {
    TestBed.configureTestingModule({
      imports: [ShelvesComponent],
      providers: [
        provideRouter([]),
        AnnouncerService,
        {
          provide: ApiService,
          useValue: { get: async () => ({ events: [] }), post: async () => ({ acknowledgedIds: [], deferredFutureIds: [] }) },
        },
      ],
    });
    const fixture = TestBed.createComponent(ShelvesComponent);
    fixture.detectChanges();
    // The shelves render a frame after the overview.
    await new Promise(requestAnimationFrame);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('links every topic row to its lesson, its missions and its cases (REDESIGN.md 5.2, R11)', async () => {
    const host = await render();
    const rows = [...host.querySelectorAll('li.topic')];
    expect(rows).toHaveLength(SD_TOPICS.length);
    for (const row of rows) {
      const lesson = row.querySelector('a[g-entry-row]')!.getAttribute('href')!;
      const id = lesson.replace('/design/topics/', '');
      const uses = topicUses(id);
      const hrefs = [...row.querySelectorAll('.uses a')].map((a) => [a.textContent!.trim(), a.getAttribute('href')]);
      const missions = uses.missions.length === 1 ? '1 mission' : `${uses.missions.length} missions`;
      const cases = uses.cases.length === 1 ? '1 case' : `${uses.cases.length} cases`;
      expect(hrefs, id).toEqual([
        [missions, `/design/missions?topic=${id}`],
        ...(uses.cases.length ? [[cases, `/design/cases?topic=${id}`]] : []),
      ]);
    }
  });

  it('shows six shelf tiles and each shelf ends with its home missions and its cases', async () => {
    const host = await render();
    expect([...host.querySelectorAll('.overview .name')].map((n) => n.textContent)).toEqual([
      'Foundations',
      'Data',
      'Reads at scale',
      'Async & delivery',
      'Coordination',
      'Edge & operations',
    ]);
    const coordination = host.querySelector('#shelf-coordination')!;
    expect(coordination.querySelector('.home')!.textContent).toContain('Month-End Ledger');
    expect(coordination.querySelector('.also')!.textContent!.replace(/\s+/g, ' ')).toContain('Your First Scale-Up (Service Discovery),');
    expect(coordination.querySelector('a.cases')!.getAttribute('href')).toBe('/design/cases?shelf=coordination');
  });
});
