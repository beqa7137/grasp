import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SegmentedComponent } from './segmented.component';
import { SheetComponent } from './sheet.component';

@Component({
  imports: [SheetComponent, SegmentedComponent],
  template: `
    <button id="opener" (click)="open.set(true)">Filters</button>
    @if (shown()) {
      <g-sheet heading="Filters" [(open)]="open">
        <button id="first">Easy</button>
        <button id="last">Hard</button>
        <button id="hidden" hidden>Hidden</button>
        <g-segmented label="Sort" [options]="sorts" [(value)]="sort" />
      </g-sheet>
    }
  `,
})
class HostComponent {
  readonly open = signal(false);
  readonly shown = signal(true);
  readonly sorts = [
    { value: 'new', label: 'Newest' },
    { value: 'old', label: 'Oldest' },
  ];
  readonly sort = signal('new');
}

// jsdom has no modal dialogs; these stand in for the browser's, which fires close whenever an open dialog closes.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});

function setup() {
  const fixture = TestBed.createComponent(HostComponent);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const $ = (selector: string) => el.querySelector<HTMLElement>(selector)!;
  const press = (key: string, shiftKey = false) => {
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
  const openSheet = () => {
    $('#opener').focus();
    $('#opener').click();
    fixture.detectChanges();
  };
  return { fixture, $, press, openSheet, dialog: () => el.querySelector('dialog')!, open: fixture.componentInstance.open };
}

describe('SheetComponent', () => {
  it('opens as a modal dialog named by its heading, with focus on its first control', () => {
    const { $, openSheet, dialog } = setup();
    expect(dialog().open).toBe(false);
    openSheet();
    expect(dialog().open).toBe(true);
    expect(document.getElementById(dialog().getAttribute('aria-labelledby')!)?.textContent).toBe('Filters');
    expect(document.activeElement).toBe($('.close'));
    expect($('.close').getAttribute('aria-label')).toBe('Close');
  });

  it('closes on Escape and gives focus back to what opened it', () => {
    const { $, press, openSheet, dialog, open } = setup();
    openSheet();
    $('#first').focus();
    press('Escape');
    expect(open()).toBe(false);
    expect(dialog().open).toBe(false);
    expect(document.activeElement).toBe($('#opener'));
  });

  it("closes on the dialog's own cancel, as the browser sends for Escape", () => {
    const { fixture, openSheet, dialog, open } = setup();
    openSheet();
    const cancel = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(cancel);
    fixture.detectChanges();
    expect(cancel.defaultPrevented).toBe(true);
    expect(open()).toBe(false);
  });

  it('keeps Tab inside, wrapping at both ends past hidden controls and the radios off their Tab stop', () => {
    const { $, press, openSheet } = setup();
    openSheet();
    const checked = $('[role="radio"][aria-checked="true"]');
    expect($('[role="radio"][aria-checked="false"]').tabIndex).toBe(-1);
    checked.focus();
    press('Tab');
    expect(document.activeElement).toBe($('.close'));
    press('Tab', true);
    expect(document.activeElement).toBe(checked);
  });

  it('follows a close it did not ask for, returns focus, and opens again', () => {
    const { fixture, $, openSheet, dialog, open } = setup();
    openSheet();
    dialog().close();
    fixture.detectChanges();
    expect(open()).toBe(false);
    expect(document.activeElement).toBe($('#opener'));
    openSheet();
    expect(dialog().open).toBe(true);
    expect(open()).toBe(true);
  });

  it("takes Android's back button over the page while open, and lets it go once closed", () => {
    const { fixture, openSheet, open } = setup();
    const back = () => {
      const handlers: [number, () => void][] = [];
      document.dispatchEvent(
        new CustomEvent('ionBackButton', { detail: { register: (p: number, h: () => void) => handlers.push([p, h]) } }),
      );
      return handlers;
    };
    openSheet();
    const [[priority, handler]] = back();
    expect(priority).toBe(100);
    handler();
    fixture.detectChanges();
    expect(open()).toBe(false);
    expect(back()).toEqual([]);
  });

  it('gives focus back when it is removed while open', () => {
    const { fixture, $, openSheet } = setup();
    openSheet();
    fixture.componentInstance.shown.set(false);
    fixture.detectChanges();
    expect(document.activeElement).toBe($('#opener'));
  });

  it('closes from its close button', () => {
    const { fixture, $, openSheet, open } = setup();
    openSheet();
    $('.close').click();
    fixture.detectChanges();
    expect(open()).toBe(false);
    expect(document.activeElement).toBe($('#opener'));
  });
});
