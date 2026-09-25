import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { NATIVE_PLATFORM } from './platform';
import { DARK_CLASS, SWITCHING_CLASS, SYSTEM_BARS, type SystemBarsApi } from './theme-chrome';
import { FIRST_PAINT_KEY, PREFERS_DARK, THEME_KEY, ThemeService } from './theme.service';

/** Stands in for matchMedia('(prefers-color-scheme: dark)'), which jsdom lacks. */
function fakeDevice(dark: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  return {
    matches: dark,
    listeners,
    addEventListener: (_type: 'change', listener: (e: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: 'change', listener: (e: MediaQueryListEvent) => void) => listeners.delete(listener),
    switchTo(next: boolean) {
      this.matches = next;
      for (const listener of listeners) listener({ matches: next } as MediaQueryListEvent);
    },
  };
}

function setUp({ deviceDark = true, native = false, bars }: { deviceDark?: boolean; native?: boolean; bars?: SystemBarsApi } = {}) {
  const device = fakeDevice(deviceDark);
  TestBed.configureTestingModule({
    providers: [
      { provide: PREFERS_DARK, useValue: device },
      { provide: NATIVE_PLATFORM, useValue: native },
      ...(bars ? [{ provide: SYSTEM_BARS, useValue: bars }] : []),
    ],
  });
  return { device, theme: TestBed.inject(ThemeService) };
}

const page = () => ({
  dark: document.documentElement.classList.contains(DARK_CLASS),
  scheme: document.querySelector('meta[name="color-scheme"]')?.getAttribute('content'),
  themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
});

/** Holds requestAnimationFrame callbacks until the test runs the next frame. */
function stubFrames() {
  const pending: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => pending.push(callback));
  return () => pending.splice(0).forEach((callback) => callback(performance.now()));
}

describe('ThemeService', () => {
  beforeEach(() => {
    // A dark page shell, with the two backgrounds the stylesheet gives --g-bg.
    document.documentElement.className = DARK_CLASS;
    document.head.innerHTML = `
      <meta name="color-scheme" content="dark"><meta name="theme-color" content="#0b0d12">
      <style>:root { --g-bg: #f4f5f9; } :root.${DARK_CLASS} { --g-bg: #0b0d12; }</style>`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.head.innerHTML = '';
    document.documentElement.className = '';
  });

  it('follows the device by default, and keeps following it as it changes', async () => {
    const { device, theme } = setUp({ deviceDark: false });
    await theme.init();
    expect(theme.preference()).toBe('system');
    expect(page()).toEqual({ dark: false, scheme: 'light', themeColor: '#f4f5f9' });

    device.switchTo(true);
    expect(theme.dark()).toBe(true);
    expect(page()).toEqual({ dark: true, scheme: 'dark', themeColor: '#0b0d12' });
  });

  it('lets Light and Dark override the device, and remembers them on this device', async () => {
    const { device, theme } = setUp({ deviceDark: true });
    await theme.init();
    await theme.setPreference('light');
    expect(page()).toEqual({ dark: false, scheme: 'light', themeColor: '#f4f5f9' });
    device.switchTo(false);
    device.switchTo(true);
    expect(page().dark).toBe(false);

    TestBed.resetTestingModule();
    const reloaded = setUp({ deviceDark: true }).theme;
    await reloaded.init();
    expect(reloaded.preference()).toBe('light');
    expect(reloaded.dark()).toBe(false);

    await reloaded.setPreference('dark');
    TestBed.resetTestingModule();
    const again = setUp({ deviceDark: false }).theme;
    await again.init();
    expect(again.preference()).toBe('dark');
    expect(page()).toEqual({ dark: true, scheme: 'dark', themeColor: '#0b0d12' });
  });

  it('forgets the stored choice when set back to System', async () => {
    const { theme } = setUp({ deviceDark: false });
    await theme.setPreference('dark');
    expect((await Preferences.get({ key: THEME_KEY })).value).toBe('dark');

    await theme.setPreference('system');
    expect((await Preferences.get({ key: THEME_KEY })).value).toBeNull();
    expect(page().dark).toBe(false);
  });

  it('holds colour transitions off for two frames when the theme switches, but not when the app starts', async () => {
    const nextFrame = stubFrames();
    const { device, theme } = setUp({ deviceDark: true });
    await theme.init();
    expect(document.documentElement.classList.contains(SWITCHING_CLASS)).toBe(false);

    for (const switchTheme of [() => theme.setPreference('light'), () => theme.setPreference('system'), () => device.switchTo(false)]) {
      await switchTheme();
      expect(document.documentElement.classList.contains(SWITCHING_CLASS)).toBe(true);
      nextFrame();
      expect(document.documentElement.classList.contains(SWITCHING_CLASS)).toBe(true);
      nextFrame();
      expect(document.documentElement.classList.contains(SWITCHING_CLASS)).toBe(false);
    }
  });

  it('stops following the device once it is destroyed', async () => {
    const { device, theme } = setUp({ deviceDark: false });
    await theme.init();
    await theme.init();
    expect(device.listeners.size).toBe(1);

    TestBed.resetTestingModule();
    expect(device.listeners.size).toBe(0);
    device.switchTo(true);
    expect(theme.dark()).toBe(false);
    expect(page().dark).toBe(false);
  });

  describe('on iOS and Android', () => {
    // Native Preferences keep their values outside localStorage; a storage group of its own stands in for that.
    beforeEach(() => Preferences.configure({ group: 'NativeStandIn' }));
    afterEach(() => Preferences.configure({ group: 'CapacitorStorage' }));

    it('copies the choice where theme-boot.js reads it and styles the system bars', async () => {
      const styles: string[] = [];
      const bars: SystemBarsApi = { setStyle: async ({ style }) => void styles.push(style) };
      const { device, theme } = setUp({ deviceDark: true, native: true, bars });
      await theme.init();
      expect(localStorage.getItem(FIRST_PAINT_KEY)).toBeNull();

      await theme.setPreference('light');
      expect(localStorage.getItem(FIRST_PAINT_KEY)).toBe('light');
      await theme.setPreference('system');
      expect(localStorage.getItem(FIRST_PAINT_KEY)).toBeNull();
      device.switchTo(false);
      expect(styles).toEqual(['DARK', 'LIGHT', 'DARK', 'LIGHT']);
    });

    it('copies a choice stored before this launch, so the next launch paints it first', async () => {
      await Preferences.set({ key: THEME_KEY, value: 'light' });
      expect(localStorage.getItem(FIRST_PAINT_KEY)).toBeNull();

      const { theme } = setUp({ deviceDark: true, native: true, bars: { setStyle: async () => undefined } });
      await theme.init();
      expect(localStorage.getItem(FIRST_PAINT_KEY)).toBe('light');
      expect(page().dark).toBe(false);
    });
  });
});
