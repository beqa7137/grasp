import { scrollKeeping } from './scroll-keeping';

describe('scrollKeeping', () => {
  const view = { top: 48, bottom: 600 };

  it('scrolls the whole way when nothing is kept, or every kept box stays in view', () => {
    expect(scrollKeeping(300, view, [])).toBe(300);
    expect(scrollKeeping(300, view, [{ top: 400, bottom: 430 }])).toBe(300);
    expect(scrollKeeping(-200, view, [{ top: 100, bottom: 130 }])).toBe(-200);
  });

  it('stops content moving up where a kept box reaches the top of the view, and moving down where one reaches the foot', () => {
    expect(scrollKeeping(300, view, [{ top: 120, bottom: 150 }])).toBe(72);
    expect(
      scrollKeeping(300, view, [
        { top: 500, bottom: 530 },
        { top: 90, bottom: 110 },
      ]),
    ).toBe(42);
    expect(scrollKeeping(-300, view, [{ top: 400, bottom: 450 }])).toBe(-150);
  });

  it('stops a box that starts beyond the view as it reaches the far edge, and lets one past the near edge hold nothing back', () => {
    expect(scrollKeeping(800, view, [{ top: 700, bottom: 730 }])).toBe(652);
    expect(scrollKeeping(-800, view, [{ top: -90, bottom: -60 }])).toBe(-660);
    expect(scrollKeeping(300, view, [{ top: -60, bottom: -20 }])).toBe(300);
    expect(scrollKeeping(-300, view, [{ top: 640, bottom: 680 }])).toBe(-300);
  });

  it('lets a box partly out of view hold back only a scroll that carries it further out', () => {
    expect(scrollKeeping(300, view, [{ top: 30, bottom: 60 }])).toBe(0);
    expect(scrollKeeping(-100, view, [{ top: 30, bottom: 60 }])).toBe(-100);
    expect(scrollKeeping(-100, view, [{ top: 590, bottom: 620 }])).toBe(0);
  });
});
