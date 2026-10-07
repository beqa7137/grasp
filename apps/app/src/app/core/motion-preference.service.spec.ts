import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { MOTION_KEY, MOTION_MIRROR_KEY } from './motion';
import { MotionPreferenceService } from './motion-preference.service';

describe('MotionPreferenceService', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-motion');
  });

  it('starts at System, and reads a choice saved on this device', async () => {
    const fresh = TestBed.inject(MotionPreferenceService);
    await fresh.init();
    expect(fresh.preference()).toBe('system');

    await Preferences.set({ key: MOTION_KEY, value: 'reduced' });
    TestBed.resetTestingModule();
    const reloaded = TestBed.inject(MotionPreferenceService);
    await reloaded.init();
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
    const loading = motion.init();
    await motion.setPreference('full');
    await loading;
    expect(motion.preference()).toBe('full');
    expect(document.documentElement.getAttribute('data-motion')).toBe('full');
  });

  describe('on iOS and Android', () => {
    // Native Preferences keep their values outside localStorage; a storage group of its own stands in for that.
    beforeEach(() => Preferences.configure({ group: 'NativeStandIn' }));
    afterEach(() => Preferences.configure({ group: 'CapacitorStorage' }));

    it('restores data-motion and the boot mirror from a choice whose mirror was lost', async () => {
      await Preferences.set({ key: MOTION_KEY, value: 'reduced' });
      expect(localStorage.getItem(MOTION_MIRROR_KEY)).toBeNull();

      const motion = TestBed.inject(MotionPreferenceService);
      await motion.init();
      expect(motion.preference()).toBe('reduced');
      expect(document.documentElement.getAttribute('data-motion')).toBe('reduced');
      expect(localStorage.getItem(MOTION_MIRROR_KEY)).toBe('reduced');
    });

    it('drops a stale mirror when the stored choice is System', async () => {
      localStorage.setItem(MOTION_MIRROR_KEY, 'full');
      document.documentElement.setAttribute('data-motion', 'full');
      await TestBed.inject(MotionPreferenceService).init();
      expect(localStorage.getItem(MOTION_MIRROR_KEY)).toBeNull();
      expect(document.documentElement.hasAttribute('data-motion')).toBe(false);
    });
  });
});
