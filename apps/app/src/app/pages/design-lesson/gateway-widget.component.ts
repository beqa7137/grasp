import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { gatewayRun, type TokenCheck } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const HITS = [0, 50, 90, 99];
const SIDECARS = [0.1, 0.25, 0.5, 1, 2];

/** A request through a gateway and a chain of services: what token checks and a mesh add to it. */
@Component({
  selector: 'app-gateway-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RovingSelectDirective],
  template: `
    <div class="controls" role="radiogroup" aria-label="Token check">
      <button
        class="g-btn"
        role="radio"
        [attr.aria-checked]="check() === 'jwt'"
        [class.primary]="check() === 'jwt'"
        (click)="check.set('jwt')"
      >
        Signed JWT
      </button>
      <button
        class="g-btn"
        role="radio"
        [attr.aria-checked]="check() === 'introspection'"
        [class.primary]="check() === 'introspection'"
        (click)="check.set('introspection')"
      >
        Introspection
      </button>
    </div>
    @if (check() === 'introspection') {
      <div class="controls" role="radiogroup" aria-label="Cache hit rate">
        <span class="muted">Answers cached</span>
        @for (h of hitOptions; track h) {
          <button class="g-btn" role="radio" [attr.aria-checked]="hit() === h" [class.primary]="hit() === h" (click)="hit.set(h)">
            {{ h }}%
          </button>
        }
      </div>
    }
    <label class="slider">
      <span
        >Services in the call chain <strong class="mono">{{ hops() }}</strong></span
      >
      <input type="range" min="1" max="8" step="1" [value]="hops()" (input)="hops.set(+$any($event.target).value)" />
    </label>
    <label class="toggle">
      <input type="checkbox" [checked]="mesh()" (change)="mesh.set($any($event.target).checked)" />
      Service mesh with sidecar proxies
    </label>
    @if (mesh()) {
      <div class="controls" role="radiogroup" aria-label="Cost of each sidecar">
        <span class="muted">Each sidecar adds</span>
        @for (c of sidecarOptions; track c) {
          <button
            class="g-btn"
            role="radio"
            [attr.aria-checked]="sidecar() === c"
            [class.primary]="sidecar() === c"
            (click)="sidecar.set(c)"
          >
            {{ c }} ms
          </button>
        }
      </div>
    }

    <dl class="readouts" aria-live="polite">
      <div [class.bad]="run().addedMs > 5">
        <dt>Added to each request</dt>
        <dd class="mono">{{ run().addedMs | number: '1.1-1' }} ms</dd>
      </div>
      <div [class.bad]="run().authCallsPerSecond > 1000">
        <dt>Calls a second to the auth server</dt>
        <dd class="mono">{{ run().authCallsPerSecond | number: '1.0-0' }}</dd>
      </div>
      <div>
        <dt>Proxies passed</dt>
        <dd class="mono">{{ run().proxies }}</dd>
      </div>
    </dl>
    <p class="muted note">10,000 requests a second; an introspection call to the auth server takes 5 ms.</p>
  `,
  styleUrl: './widget.scss',
  styles: `
    .controls .muted {
      font-size: 0.875rem;
    }
    .readouts {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }
    .note {
      font-size: 0.8125rem;
      margin: 10px 0 0;
    }
  `,
})
export class GatewayWidgetComponent {
  readonly hitOptions = HITS;
  readonly sidecarOptions = SIDECARS;
  readonly check = signal<TokenCheck>('jwt');
  readonly hit = signal(90);
  readonly hops = signal(4);
  readonly mesh = signal(false);
  readonly sidecar = signal(0.5);
  readonly run = computed(() =>
    gatewayRun(this.check(), {
      rps: 10_000,
      authMs: 5,
      cacheHitPct: this.hit(),
      hops: this.hops(),
      mesh: this.mesh(),
      sidecarMs: this.sidecar(),
    }),
  );
}
