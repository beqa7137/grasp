import { TestBed } from '@angular/core/testing';
import { CodeTextComponent } from './code-text.component';

function render(text: string): HTMLElement {
  const fixture = TestBed.createComponent(CodeTextComponent);
  fixture.componentRef.setInput('text', text);
  fixture.detectChanges();
  return fixture.nativeElement;
}

describe('CodeTextComponent', () => {
  it('sets backtick spans as code and the rest as prose, adding no spaces of its own', () => {
    const el = render('What is x after `x ^= n`?');
    expect([...el.querySelectorAll('code')].map((code) => code.textContent)).toEqual(['x ^= n']);
    expect([...el.querySelectorAll('span')].map((span) => span.textContent)).toEqual(['What is x after ', '?']);
    expect(el.textContent).toBe('What is x after x ^= n?');
  });

  it('keeps adjacent spans and punctuation tight', () => {
    const el = render('`p - k`, then `dp[i]`.');
    expect(el.textContent).toBe('p - k, then dp[i].');
    expect(el.querySelectorAll('code')).toHaveLength(2);
  });

  it('shows an unbalanced backtick literally', () => {
    const el = render('a `b` c`d');
    expect(el.querySelector('code')).toBeNull();
    expect(el.textContent).toBe('a `b` c`d');
  });

  it('renders markup in the text as text', () => {
    const el = render('`<b>x</b>` <img src=x>');
    expect(el.querySelector('b, img')).toBeNull();
    expect(el.textContent).toBe('<b>x</b> <img src=x>');
  });
});
