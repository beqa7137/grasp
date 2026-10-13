import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ArticleComponent } from './article.component';

@Component({
  imports: [ArticleComponent],
  template: `
    <g-article>
      <dl>
        <dt>Sorted input</dt>
        <dd>Binary search</dd>
      </dl>
    </g-article>
    <dl><dt>Outside</dt></dl>
  `,
})
class HostComponent {}

describe('ArticleComponent', () => {
  it('styles the content projected into it, and nothing outside it', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const [inside, outside] = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('dt'));
    expect(getComputedStyle(inside).fontWeight).toBe('600');
    expect(getComputedStyle(outside).fontWeight).not.toBe('600');
  });
});
