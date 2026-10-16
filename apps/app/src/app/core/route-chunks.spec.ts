import { ROUTE_CHUNKS_ID, preloadChunks } from './route-chunks';

function withList(list: object): Document {
  const doc = document.implementation.createHTMLDocument('');
  const block = doc.createElement('script');
  block.id = ROUTE_CHUNKS_ID;
  block.type = 'application/json';
  block.textContent = JSON.stringify(list);
  doc.head.append(block);
  return doc;
}

const links = (doc: Document) => [...doc.head.querySelectorAll('link[rel="modulepreload"]')].map((l) => l.getAttribute('href'));

describe('route chunks', () => {
  it('adds one modulepreload link per chunk of the module, once, and nothing for a module without a list', () => {
    const doc = withList({ 'pages/a': ['chunk-1.js', 'chunk-2.js'], 'pages/b': ['chunk-2.js', 'chunk-3.js'] });
    preloadChunks('pages/a', doc);
    preloadChunks('pages/a', doc);
    preloadChunks('pages/b', doc);
    preloadChunks('pages/unknown', doc);
    expect(links(doc)).toEqual(['chunk-1.js', 'chunk-2.js', 'chunk-3.js']);
  });

  it('reads each document it is given, and does nothing without a list or with a broken one', () => {
    const other = withList({ 'pages/a': ['chunk-9.js'] });
    preloadChunks('pages/a', other);
    expect(links(other)).toEqual(['chunk-9.js']);

    const none = document.implementation.createHTMLDocument('');
    preloadChunks('pages/a', none);
    expect(links(none)).toEqual([]);

    const broken = withList({});
    broken.getElementById(ROUTE_CHUNKS_ID)!.textContent = '{';
    preloadChunks('pages/a', broken);
    expect(links(broken)).toEqual([]);
  });
});
