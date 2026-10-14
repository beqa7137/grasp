import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ChartAxis } from './chart-frame.component';
import { TimelineComponent, type TimelineEvent, type TimelineMessage, type TimelineSpan } from './timeline.component';

const AXIS: ChartAxis = { min: 0, max: 3000, ticks: [0, 1000, 2000, 3000], format: (v) => `${v / 1000} s` };

@Component({
  imports: [TimelineComponent],
  template: `
    <g-timeline
      [width]="400"
      [axis]="axis"
      [lanes]="lanes"
      [spans]="spans"
      [events]="events"
      [messages]="messages"
      [handles]="[{ id: 'lag', lane: 'replica', at: lag(), values: [0, 500, 1000, 1500], label: 'Lag', valuetext: lag() + ' ms' }]"
      [now]="now()"
      summary="A write and a read"
      (moved)="lag.set($event.value)"
    />
  `,
})
class Host {
  readonly axis = AXIS;
  readonly lanes = [
    { id: 'you', label: 'You' },
    { id: 'replica', label: 'Replica' },
  ];
  readonly spans: TimelineSpan[] = [
    { lane: 'replica', from: 0, to: 1000, tone: 'muted', label: 'without your write' },
    { lane: 'you', from: 0, to: 1000, tone: 'critical', label: 'a read here is stale' },
  ];
  readonly events: TimelineEvent[] = [
    { lane: 'you', at: 0, n: 1, tone: 'current', label: 'write' },
    { lane: 'you', at: 200, n: 2, tone: 'current', label: 'read' },
    { lane: 'replica', at: 1000, n: 3, tone: 'final', label: 'applies it' },
  ];
  readonly messages: TimelineMessage[] = [
    { id: 'm', from: { lane: 'you', at: 0 }, to: { lane: 'replica', at: 1000 }, tone: 'considering' },
  ];
  readonly lag = signal(1000);
  readonly now = signal(Infinity);
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const texts = (selector: string) => [...el.querySelectorAll(selector)].map((t) => t.textContent!.trim());
  return { fixture, el, texts, host: fixture.componentInstance };
}

describe('TimelineComponent', () => {
  it('numbers its events, names its lanes, and keeps span labels in a legend under the axis', () => {
    const { el, texts } = setup();
    expect(texts('.num')).toEqual(['1', '2', '3']);
    expect(texts('.lane-label')).toEqual(['You', 'Replica']);
    expect(texts('.tick')).toEqual(['0 s', '1 s', '2 s', '3 s']);
    expect(texts('.legend li')).toEqual(['without your write', 'a read here is stale']);
    expect(el.querySelector('svg')!.getAttribute('aria-label')).toBe('A write and a read');
  });

  it('never prints two event labels over each other', () => {
    const { el } = setup();
    const boxes = [...el.querySelectorAll<SVGTextElement>('.event-label')].map((t) => ({
      x: Number(t.getAttribute('x')),
      y: Number(t.getAttribute('y')),
      text: t.textContent!.trim(),
    }));
    const [write, read] = boxes;
    expect(write.y !== read.y || read.x >= write.x + write.text.length * 6).toBe(true);
  });

  it('draws only what has happened by now, with a message in flight part way along', () => {
    const { fixture, host, texts, el } = setup();
    host.now.set(500);
    fixture.detectChanges();
    expect(texts('.num')).toEqual(['1', '2']);
    expect(el.querySelectorAll('.message circle.travel')).toHaveLength(1);
    expect(el.querySelector('line.now')).not.toBeNull();
    // The lag handle sits at 1 s, ahead of the play: it fades rather than ring an empty spot.
    expect(el.querySelector('g-handle')!.classList).toContain('ahead');
    host.now.set(Infinity);
    fixture.detectChanges();
    expect(el.querySelector('g-handle')!.classList).not.toContain('ahead');
  });

  it('drags a moment along its lane with a handle that snaps', () => {
    const { fixture, host, el } = setup();
    const handle = el.querySelector<HTMLElement>('g-handle')!;
    expect(handle.getAttribute('aria-label')).toBe('Lag');
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(host.lag()).toBe(500);
  });
});
