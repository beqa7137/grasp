import {
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  DestroyRef,
  ViewContainerRef,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
  type Type,
} from '@angular/core';

type LoadState = 'loading' | 'loaded' | 'failed';

/**
 * A lesson widget loaded in its own chunk, so the kit it draws with stays out of the lesson's. It is not `@defer`: that
 * pulls Angular's defer runtime into the core chunk, about 6.5 kB more on every first paint. While the chunk loads it
 * holds `placeholder` px, so the page below barely moves; if the load fails (offline, a deploy replaced the chunk) it
 * says so and offers a reload: the browser keeps a failed `import()` of a URL, so only a reload can fetch it again.
 */
@Component({
  selector: 'app-lazy-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.min-height.px]': "state() === 'loading' ? placeholder() : null", '[style.display]': "'block'" },
  template: `
    @if (state() === 'failed') {
      <p class="failed" role="alert">
        Couldn't load this widget.
        <button type="button" class="g-btn" (click)="reload()">Reload</button>
      </p>
    }
  `,
  styles: `
    .failed {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--g-space-3);
      margin: 0;
      color: var(--g-muted);
    }
  `,
})
export class LazyWidgetComponent {
  readonly load = input.required<() => Promise<Type<unknown>>>();
  readonly inputs = input<Record<string, unknown>>({});
  readonly placeholder = input(0);
  readonly state = signal<LoadState>('loading');
  private ref: ComponentRef<unknown> | null = null;
  private readonly container = inject(ViewContainerRef);
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
    afterNextRender(() => this.fetch());
    effect(() => this.applyInputs());
  }

  /** Reloads the page; replaced in specs. */
  reload = () => location.reload();

  private fetch() {
    this.load()().then(
      (component) => {
        if (this.destroyed) return;
        this.ref = this.container.createComponent(component);
        this.applyInputs();
        this.state.set('loaded');
      },
      () => this.state.set('failed'),
    );
  }

  private applyInputs() {
    const inputs = this.inputs();
    if (this.ref) for (const [name, value] of Object.entries(inputs)) this.ref.setInput(name, value);
  }
}
