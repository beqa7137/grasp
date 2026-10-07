import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { MOTION_KEY, MOTION_MIRROR_KEY } from './motion';
import { MotionPreferenceService } from './motion-preference.service';

const settled = () => new Promise((resolve) => setTimeout(resolve));

describe('MotionPreferenceService', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-motion');
  });

  it('starts at System, and reads a choice saved on this device', async () => {
    const fresh = TestBed.inject(MotionPreferenceService);
    await settled();
    expect(fresh.preference()).toBe('system');

    await Preferences.set({ key: MOTION_KEY, value: 'reduced' });
    TestBed.resetTestingModule();
    const reloaded = TestBed.inject(MotionPreferenceService);
    await settled();
    expect(reloaded.preference()).toBe('reduced');
  });

  it('applies a choice at once and mirrors it for the next start, System removing both', async () => {
    const motion = TestBed.inject(MotionPreferenceService);
    await motion.setPreference('full');
    expect(document.documentElement.getAttribute('data-motion')).toBe('full');
    expect(localStorage.getItem(MOTION_MIRROR_KEY)).toBe('full');
    expect((await Preferences.get({ key: MOTION_KEY })).value).toBe('full');

    await motion.setPreference('system');
    expect(document.documentElement.hasAttribute('data-motion')).toBe(false);
    expect(localStorage.getItem(MOTION_MIRROR_KEY)).toBeNull();
    expect((await Preferences.get({ key: MOTION_KEY })).value).toBeNull();
  });

  it('never overrides the test mode', async () => {
    document.documentElement.setAttribute('data-motion', 'off');
    await TestBed.inject(MotionPreferenceService).setPreference('full');
    expect(document.documentElement.getAttribute('data-motion')).toBe('off');
    expect(localStorage.getItem(MOTION_MIRROR_KEY)).toBe('full');
  });

  it('keeps a choice made before the saved one loads', async () => {
    await Preferences.set({ key: MOTION_KEY, value: 'reduced' });
    const motion = TestBed.inject(MotionPreferenceService);
    const choosing = motion.setPreference('full');
    await settled();
    await choosing;
    expect(motion.preference()).toBe('full');
  });
});
