import { TestBed } from '@angular/core/testing';
import { CODE_TEXT_KEEP, CodeTextComponent } from './code-text.component';

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
    expect(el.textContent).toBe('What is x after x ^= n?');
  });

  it('keeps adjacent spans and punctuation tight', () => {
    const el = render('`p - k`, then `dp[i]`.');
    expect(el.textContent).toBe('p - k, then dp[i].');
    expect(el.querySelectorAll('code')).toHaveLength(2);
  });

  it('keeps a code span and the punctuation after it together, apart from the prose', () => {
    const el = render('equal to `p - k`. Then `x`');
    expect([...el.querySelectorAll('.run')].map((run) => run.textContent)).toEqual(['p - k.', 'x']);
    expect([...el.querySelectorAll('span:not(.run)')].map((span) => span.textContent)).toEqual(['equal to ', ' Then ']);
  });

  it('keeps each number on one line with its unit, and a percentile with its value', () => {
    const el = render('p99 230 ms, p50 35 ms; about 1 s, or 1,500 ms in 2.5 s, from 64 MB. 3 servers and 80% busy, `x = 10 ms`.');
    expect([...el.querySelectorAll('.keep')].map((k) => k.textContent)).toEqual([
      'p99 230 ms',
      'p50 35 ms',
      '1 s',
      '1,500 ms',
      '2.5 s',
      '64 MB',
    ]);
    expect(el.textContent).toBe('p99 230 ms, p50 35 ms; about 1 s, or 1,500 ms in 2.5 s, from 64 MB. 3 servers and 80% busy, x = 10 ms.');
  });

  it('keeps only the house runs whole by default', () => {
    expect([...render('at 64 MB, ratio 10 and "not here"').querySelectorAll('.keep')].map((k) => k.textContent)).toEqual(['64 MB']);
  });

  it('keeps the runs a provided keep rule names whole instead', () => {
    TestBed.configureTestingModule({ providers: [{ provide: CODE_TEXT_KEEP, useValue: /\bratio \d+|"[^"]*"/g }] });
    expect([...render('at 64 MB, ratio 10 and "not here"').querySelectorAll('.keep')].map((k) => k.textContent)).toEqual([
      'ratio 10',
      '"not here"',
    ]);
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
