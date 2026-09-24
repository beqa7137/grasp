import { withoutQueryStrings } from './error-reporting';

describe('error reports', () => {
  it('drop query strings and fragments from the request and navigation breadcrumbs', () => {
    const event = withoutQueryStrings({
      request: { url: 'https://grasp.example/drill?pattern=hashing#top', query_string: 'pattern=hashing' },
      breadcrumbs: [
        { category: 'navigation', data: { from: '/learn?x=1', to: '/drill?pattern=hashing' } },
        { category: 'fetch', data: { url: '/api/progress?since=2026', method: 'GET' } },
        { category: 'ui.click', message: 'button' },
      ],
    });
    expect(event.request).toEqual({ url: 'https://grasp.example/drill' });
    expect(event.breadcrumbs).toEqual([
      { category: 'navigation', data: { from: '/learn', to: '/drill' } },
      { category: 'fetch', data: { url: '/api/progress', method: 'GET' } },
      { category: 'ui.click', message: 'button' },
    ]);
  });
});
