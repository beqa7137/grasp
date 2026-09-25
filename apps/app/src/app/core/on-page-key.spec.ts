import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { onPageKey, type PageKeyKind } from './on-page-key';
import { ShortcutsService } from './shortcuts.service';

let kind: PageKeyKind = 'page';

@Component({ selector: 'app-page', template: '<textarea></textarea>' })
class PageComponent {
  readonly keys: string[] = [];

  constructor() {
    onPageKey((e) => this.keys.push(`${e.metaKey ? 'Cmd+' : e.ctrlKey ? 'Ctrl+' : ''}${e.key}`), { kind });
  }
}

function setup(pageKind: PageKeyKind) {
  kind = pageKind;
  const fixture = TestBed.createComponent(PageComponent);
  const press = (target: Element, key: string, init: KeyboardEventInit = {}) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, ...init }));
  const field = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
  return { fixture, keys: fixture.componentInstance.keys, press, field };
}

describe('onPageKey', () => {
  afterEach(() => document.querySelectorAll('ion-modal').forEach((modal) => modal.remove()));

  it('gives the page the keys that belong to it, and stops listening once the page is gone', () => {
    const { fixture, keys, press, field } = setup('page');
    press(document.body, 'ArrowRight');
    press(field, 'ArrowLeft');
    expect(keys).toEqual(['ArrowRight']);
    fixture.destroy();
    press(document.body, 'ArrowRight');
    expect(keys).toEqual(['ArrowRight']);
  });

  it('drops the single-key shortcuts once Settings turns them off', () => {
    const { keys, press } = setup('shortcuts');
    press(document.body, '1');
    TestBed.inject(ShortcutsService).characterKeys.set(false);
    press(document.body, '2');
    press(document.body, 'Enter');
    expect(keys).toEqual(['1', 'Enter']);
  });

  it('runs a chord typed in the page, but not one typed in a dialog open over it', () => {
    const { keys, press, field } = setup('chord');
    const feedback = document.body.appendChild(document.createElement('ion-modal')).appendChild(document.createElement('textarea'));
    press(feedback, 'Enter', { metaKey: true });
    press(field, 'Enter', { ctrlKey: true });
    expect(keys).toEqual(['Ctrl+Enter']);
  });
});
