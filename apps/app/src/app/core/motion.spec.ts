import { MOTION_MIRROR_KEY, bootMotion, motionScroll } from './motion';

function fakeWindow({ url = 'https://grasp.test/learn', saved = null as string | null, deviceReduces = false, blocked = false } = {}) {
  const root = document.createElement('html');
  let href = url;
  const replaced: string[] = [];
  const win = {
    document: { documentElement: root },
    location: {
      get href() {
        return href;
      },
    },
    history: {
      state: { navigationId: 1 },
      replaceState: (_state: unknown, _title: string, next: string) => {
        href = next;
        replaced.push(next);
      },
    },
    get localStorage() {
      if (blocked) throw new DOMException('blocked', 'SecurityError');
      return { getItem: (key: string) => (key === MOTION_MIRROR_KEY ? saved : null) };
    },
    matchMedia: (query: string) => ({ matches: deviceReduces && query === '(prefers-reduced-motion: reduce)' }),
  } as unknown as Window;
  return { win, root, replaced, href: () => href };
}

describe('bootMotion', () => {
  it.each([
    { saved: null, deviceReduces: false, attribute: null, animated: true },
    { saved: null, deviceReduces: true, attribute: null, animated: false },
    { saved: 'reduced', deviceReduces: false, attribute: 'reduced', animated: false },
    { saved: 'full', deviceReduces: true, attribute: 'full', animated: true },
    { saved: 'nonsense', deviceReduces: false, attribute: null, animated: true },
  ])('resolves $saved on a device that reduces motion: $deviceReduces', ({ saved, deviceReduces, attribute, animated }) => {
    const { win, root } = fakeWindow({ saved, deviceReduces });
    expect(bootMotion(win)).toEqual({ animated });
    expect(root.getAttribute('data-motion')).toBe(attribute);
  });

  it('keeps the test mode an init script set, over a saved Full', () => {
    const { win, root } = fakeWindow({ saved: 'full' });
    root.setAttribute('data-motion', 'off');
    expect(bootMotion(win)).toEqual({ animated: false });
    expect(root.getAttribute('data-motion')).toBe('off');
  });

  it('takes ?motion=off as the test mode and strips only that parameter', () => {
    const { win, root, replaced } = fakeWindow({ url: 'https://grasp.test/visualize/lcs?input=%5B1%5D&motion=off#step', saved: 'full' });
    expect(bootMotion(win)).toEqual({ animated: false });
    expect(root.getAttribute('data-motion')).toBe('off');
    expect(replaced).toEqual(['https://grasp.test/visualize/lcs?input=%5B1%5D#step']);
  });

  it('leaves the URL alone without the parameter', () => {
    const { win, replaced } = fakeWindow({ url: 'https://grasp.test/settings?motion=on' });
    bootMotion(win);
    expect(replaced).toEqual([]);
  });

  it('follows the device when storage is blocked', () => {
    const { win, root } = fakeWindow({ blocked: true, deviceReduces: true });
    expect(bootMotion(win)).toEqual({ animated: false });
    expect(root.hasAttribute('data-motion')).toBe(false);
  });
});

describe('motionScroll', () => {
  it.each([
    { attribute: null, deviceReduces: false, behavior: 'smooth' },
    { attribute: null, deviceReduces: true, behavior: 'auto' },
    { attribute: 'full', deviceReduces: true, behavior: 'smooth' },
    { attribute: 'reduced', deviceReduces: false, behavior: 'auto' },
    { attribute: 'off', deviceReduces: false, behavior: 'auto' },
  ])(
    'scrolls $behavior with data-motion $attribute on a device that reduces motion: $deviceReduces',
    ({ attribute, deviceReduces, behavior }) => {
      const { win, root } = fakeWindow({ deviceReduces });
      if (attribute) root.setAttribute('data-motion', attribute);
      expect(motionScroll(win)).toBe(behavior);
    },
  );
});
