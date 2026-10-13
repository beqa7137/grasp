import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input } from '@angular/core';
import { IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

/**
 * A page's header in its content (REDESIGN.md 3.2): eyebrow, the large title, lede, meta and actions. The title sits in
 * Ionic's condense header, so the toolbar's own title stays hidden until the large one scrolls under it and the page never
 * shows its title twice. Use it first in a fullscreen `ion-content` whose page keeps an `ion-header` with the same title.
 */
@Component({
  selector: 'g-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonTitle],
  template: `
    @if (eyebrow(); as eyebrow) {
      <p class="eyebrow">{{ eyebrow }}</p>
    }
    <ion-header collapse="condense">
      <ion-toolbar>
        <ion-title size="large"
          ><h1>{{ heading() }}</h1></ion-title
        >
      </ion-toolbar>
    </ion-header>
    @if (lede(); as lede) {
      <p class="lede">{{ lede }}</p>
    }
    <div class="meta"><ng-content select="[meta]" /></div>
    <div class="actions"><ng-content select="[actions]" /></div>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: var(--g-space-5);
    }
    .eyebrow {
      margin: 0;
    }
    ion-header {
      box-shadow: none;
    }
    ion-toolbar {
      --background: transparent;
      --border-width: 0;
      --padding-start: 0;
      --padding-end: 0;
      --padding-top: 0;
      --padding-bottom: 0;
      --min-height: 0;
    }
    /* The global toolbar grid centres a title between the toolbar's buttons; this one starts at the content's edge. */
    ion-toolbar::part(container) {
      display: block;
    }
    ion-title {
      padding: 0;
    }
    h1 {
      margin: 0;
      font-size: var(--g-text-display-xl);
      line-height: 1.15;
      color: var(--g-text);
      white-space: normal;
    }
    .lede {
      margin: var(--g-space-2) 0 0;
      font-size: var(--g-text-body-l);
      line-height: 1.5;
      color: var(--g-muted);
    }
    .meta:empty,
    .actions:empty {
      display: none;
    }
    .meta {
      margin-top: var(--g-space-2);
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--g-space-2);
      margin-top: var(--g-space-4);
    }
  `,
})
export class PageHeaderComponent {
  readonly heading = input.required<string>();
  readonly eyebrow = input<string>();
  readonly lede = input<string>();

  constructor() {
    const host: HTMLElement = inject(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    // Ionic hands the banner role to whichever header shows the title, but this one sits in ion-content, the main
    // landmark, where a banner may not be (axe landmark-banner-is-top-level). The page's own header keeps the role.
    afterNextRender(() => {
      const condense = host.querySelector('ion-header')!;
      const main = host.closest('.ion-page')?.querySelector(':scope > ion-header') ?? null;
      const fix = () => {
        if (condense.getAttribute('role') !== 'none') condense.setAttribute('role', 'none');
        if (main && main.getAttribute('role') !== 'banner') main.setAttribute('role', 'banner');
      };
      const observer = new MutationObserver(fix);
      for (const header of [condense, main]) if (header) observer.observe(header, { attributeFilter: ['role'] });
      fix();
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
