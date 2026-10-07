import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { PilotService } from './pilot.service';

describe('PilotService.offerMovedNote', () => {
  beforeEach(async () => {
    await Preferences.clear();
    await Preferences.set({ key: 'grasp.pilotNotice.v1', value: '2026-01-01T00:00:00.000Z' });
  });

  async function pilot(): Promise<PilotService> {
    TestBed.resetTestingModule();
    const service = TestBed.inject(PilotService);
    await service.init();
    return service;
  }

  it('offers the note once to a learner who had progress', async () => {
    const service = await pilot();
    expect(await service.offerMovedNote(true)).toBe(true);
    expect(await service.offerMovedNote(true)).toBe(false);
    expect(await (await pilot()).offerMovedNote(true)).toBe(false);
  });

  it('never offers it to a new learner, even once progress follows', async () => {
    expect(await (await pilot()).offerMovedNote(false)).toBe(false);
    expect(await (await pilot()).offerMovedNote(true)).toBe(false);
  });

  it('never offers it in the session the welcome dialog opened, nor later', async () => {
    await Preferences.remove({ key: 'grasp.pilotNotice.v1' });
    const service = await pilot();
    expect(service.noticeOpen()).toBe(true);
    expect(await service.offerMovedNote(true)).toBe(false);
    expect(await (await pilot()).offerMovedNote(true)).toBe(false);
  });
});
