import { hardwareBack } from './hardware-back';

function page(html: string): Document {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = `<ion-router-outlet>${html}</ion-router-outlet>`;
  return doc;
}

describe('hardwareBack', () => {
  const actions = (url: string) => ({ url, goToday: vi.fn(), leave: vi.fn() });

  it("clicks the shown page's back button, not one on a page Ionic hides", () => {
    const doc = page(
      '<div class="ion-page ion-page-hidden"><app-back><ion-back-button id="hidden"></ion-back-button></app-back></div>' +
        '<div class="ion-page"><app-back><ion-back-button id="shown"></ion-back-button></app-back></div>',
    );
    const clicked: string[] = [];
    doc.querySelectorAll('ion-back-button').forEach((b) => b.addEventListener('click', () => clicked.push(b.id)));
    const on = actions('/design/missions/first-scale-up');
    hardwareBack(doc, on);
    expect(clicked).toEqual(['shown']);
    expect(on.goToday).not.toHaveBeenCalled();
    expect(on.leave).not.toHaveBeenCalled();
  });

  it("goes to Today from another tab's hub", () => {
    const on = actions('/coding/problems?track=graphs');
    hardwareBack(page('<div class="ion-page"></div>'), on);
    expect(on.goToday).toHaveBeenCalledOnce();
    expect(on.leave).not.toHaveBeenCalled();
  });

  it('leaves the app from Today', () => {
    const on = actions('/today');
    hardwareBack(page('<div class="ion-page"></div>'), on);
    expect(on.leave).toHaveBeenCalledOnce();
    expect(on.goToday).not.toHaveBeenCalled();
  });
});
