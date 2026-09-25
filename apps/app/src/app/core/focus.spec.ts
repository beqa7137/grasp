import { ApplicationRef, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { refocus, refocusAfterRender } from './focus';

describe('refocus', () => {
  afterEach(() => (document.body.innerHTML = ''));

  const setup = () => {
    document.body.innerHTML = `
      <div class="ion-page">
        <section id="card"><button id="choice">1</button><p id="reveal" tabindex="-1">Correct</p></section>
        <button id="elsewhere">Random</button>
      </div>`;
    const get = (id: string) => document.getElementById(id)!;
    return { card: get('card'), choice: get('choice') as HTMLButtonElement, reveal: get('reveal'), elsewhere: get('elsewhere') };
  };

  it('takes focus when the page lost it', () => {
    const { reveal } = setup();
    (document.activeElement as HTMLElement | null)?.blur();
    refocus(reveal);
    expect(document.activeElement).toBe(reveal);
  });

  it('takes focus from a control that was disabled while focused', () => {
    const { choice, reveal } = setup();
    choice.focus();
    choice.disabled = true;
    refocus(reveal);
    expect(document.activeElement).toBe(reveal);
  });

  it('takes focus from inside the content that changed, but not from a control elsewhere', () => {
    const { card, choice, reveal, elsewhere } = setup();
    choice.focus();
    refocus(reveal, card);
    expect(document.activeElement).toBe(reveal);

    elsewhere.focus();
    refocus(reveal, card);
    expect(document.activeElement).toBe(elsewhere);
  });

  it('does not scroll to the new focus after a tap or click, but does after a key press', () => {
    const { reveal } = setup();
    const focus = vi.spyOn(reveal, 'focus');
    document.dispatchEvent(new Event('pointerdown'));
    refocus(reveal);
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });

    reveal.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    refocus(reveal);
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: false });
  });

  it('looks the target up once the change has rendered, since the change may be what creates it', () => {
    const { card, choice, reveal } = setup();
    choice.focus();
    let target: HTMLElement | null = null;
    refocusAfterRender(TestBed.inject(Injector), () => target, card);
    target = reveal;
    TestBed.inject(ApplicationRef).tick();
    expect(document.activeElement).toBe(reveal);
  });

  it('leaves a page Ionic keeps hidden alone', () => {
    const { reveal } = setup();
    reveal.closest('.ion-page')!.classList.add('ion-page-hidden');
    refocus(reveal);
    expect(document.activeElement).not.toBe(reveal);
  });
});
