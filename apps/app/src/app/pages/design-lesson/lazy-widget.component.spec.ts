import { Component, input, signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LazyWidgetComponent } from './lazy-widget.component';

@Component({ selector: 'app-loaded', template: `loaded {{ word() }}` })
class LoadedComponent {
  readonly word = input('');
}

@Component({
  imports: [LazyWidgetComponent],
  template: `<app-lazy-widget [load]="load" [inputs]="{ word: word() }" [placeholder]="640" />`,
})
class Host {
  readonly word = signal('once');
  attempts = 0;
  fail = true;
  readonly load = (): Promise<Type<unknown>> => {
    this.attempts++;
    return this.fail ? Promise.reject(new Error('chunk')) : Promise.resolve(LoadedComponent);
  };
}

async function settle(fixture: ReturnType<typeof TestBed.createComponent<Host>>) {
  for (let i = 0; i < 3; i++) {
    TestBed.tick();
    await fixture.whenStable();
  }
  fixture.detectChanges();
}

describe('LazyWidgetComponent', () => {
  it('holds the placeholder while loading, then loads the widget and passes its inputs on', async () => {
    const fixture = TestBed.createComponent(Host);
    const el = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.fail = false;
    fixture.detectChanges();
    expect(el.querySelector<HTMLElement>('app-lazy-widget')!.style.minHeight).toBe('640px');
    await settle(fixture);
    expect(el.textContent).toContain('loaded once');
    expect(el.querySelector<HTMLElement>('app-lazy-widget')!.style.minHeight).toBe('');
    fixture.componentInstance.word.set('twice');
    await settle(fixture);
    expect(el.textContent).toContain('loaded twice');
  });

  it('says so with a Reload button when the chunk fails, since a failed import is never fetched again', async () => {
    const fixture = TestBed.createComponent(Host);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle(fixture);
    expect(el.querySelector('[role="alert"]')!.textContent).toContain("Couldn't load this widget.");
    expect(el.querySelector<HTMLElement>('app-lazy-widget')!.style.minHeight).toBe('');
    const lazy = fixture.debugElement.children[0].componentInstance as LazyWidgetComponent;
    lazy.reload = vi.fn();
    const button = el.querySelector<HTMLButtonElement>('.failed button')!;
    expect(button.textContent!.trim()).toBe('Reload');
    button.click();
    expect(lazy.reload).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.attempts).toBe(1);
  });
});
