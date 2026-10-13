import type { Page } from '@playwright/test';

/**
 * Where the shown page breaks REDESIGN.md 3.2's type rules, as R6 wrote them down:
 * - `small`: text in Space Grotesk under 20px (light DOM and SVG text);
 * - `titles`: a heading (h1 to h4) under 20px, or an h2 to h4 inside a card (`.panel`, `.card`, `.card-link`), other than a
 *   label (`.eyebrow`) or a monospaced identifier or readout (`.mono`, code type), that is not Inter 600 with normal tracking;
 * - `display`: an h1, `.display`, or an h2 or h3 outside a card, at 20px or more, that lost the display face;
 * - `labels`: uppercase text, where it starts (its parent is not uppercase), without the label role's size, weight and
 *   tracking. Ionic's own elements are skipped.
 */
export function typeFindings(page: Page) {
  return page.evaluate(() => {
    const shown = (el: Element) => !el.closest('.ion-page-hidden') && el.checkVisibility() && el.getClientRects().length > 0;
    const own = (el: Element) =>
      [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent?.trim())
        .join('')
        .trim();
    const display = (style: CSSStyleDeclaration) => /space grotesk/i.test(style.fontFamily.split(',')[0]);
    const inCard = (el: Element) => !!el.closest('.panel, .card, .card-link');
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')} "${el.textContent?.trim().slice(0, 30)}"`;
    const elements = [...document.querySelectorAll('*')].filter(shown);

    const eyebrow = document.body.appendChild(Object.assign(document.createElement('span'), { className: 'eyebrow', textContent: 'x' }));
    const { fontSize, fontWeight, letterSpacing } = getComputedStyle(eyebrow);
    eyebrow.remove();

    return {
      small: elements.filter((el) => own(el) && display(getComputedStyle(el)) && parseFloat(getComputedStyle(el).fontSize) < 20).map(name),
      titles: elements
        .filter((el) => el.matches(':is(h1, h2, h3, h4):not(.eyebrow, .mono)'))
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 20 || (!el.matches('h1') && inCard(el)))
        .filter((el) => {
          const style = getComputedStyle(el);
          return display(style) || style.fontWeight !== '600' || style.letterSpacing !== 'normal';
        })
        .map(name),
      display: elements
        .filter((el) => el.matches('h1, .display') || (el.matches('h2, h3') && !inCard(el)))
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) >= 20 && !display(getComputedStyle(el)))
        .map(name),
      labels: elements
        .filter((el) => own(el) && getComputedStyle(el).textTransform === 'uppercase')
        .filter((el) => el.parentElement && getComputedStyle(el.parentElement).textTransform !== 'uppercase')
        .filter((el) => !el.tagName.startsWith('ION-') && !el.closest('ion-alert, ion-back-button'))
        .filter((el) => {
          const style = getComputedStyle(el);
          return style.fontSize !== fontSize || style.fontWeight !== fontWeight || style.letterSpacing !== letterSpacing;
        })
        .map(name),
    };
  });
}
