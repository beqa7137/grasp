import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { StageComponent } from './stage.component';

@Component({
  imports: [StageComponent],
  template: `<g-stage #s [height]="240" label="A picture"><svg [attr.width]="s.width()"></svg></g-stage>`,
})
class Host {}

describe('StageComponent', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps its last width while its page is hidden and laid out at no size', () => {
    let report: ResizeObserverCallback = () => undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          report = cb;
        }
        observe() {
          report([{ contentRect: { width: 402 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
        }
        disconnect() {}
      },
    );
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    TestBed.tick();
    report([{ contentRect: { width: 0 } } as ResizeObserverEntry], {} as ResizeObserver);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('svg')!.getAttribute('width')).toBe('400');
  });

  it('is a named visualization group at a fixed height, and reports its inner width for a 1:1 viewBox', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly report: ResizeObserverCallback) {}
        observe() {
          this.report([{ contentRect: { width: 402 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
        }
        disconnect() {}
      },
    );
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    const stage = (fixture.nativeElement as HTMLElement).querySelector('g-stage')!;
    expect(stage.getAttribute('role')).toBe('group');
    expect(stage.getAttribute('aria-roledescription')).toBe('visualization');
    expect(stage.getAttribute('aria-label')).toBe('A picture');
    expect(stage.querySelector<HTMLElement>('.well')!.style.height).toBe('240px');
    expect(stage.querySelector('svg')!.getAttribute('width')).toBe('400');
  });
});
