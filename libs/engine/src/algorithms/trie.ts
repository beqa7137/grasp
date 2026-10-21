import { spansOf } from './annotate.js';
import { fixedChoices } from './choices.js';
import { asText, asWords } from './input.js';
import { randInt } from './random.js';
import type { AlgorithmDefinition, Frame, TreeLegend, TreeView } from './types.js';

type Input = { words: string[]; query: string };

interface TrieNode {
  id: string;
  label: string;
  parent: string | null;
  children: Map<string, TrieNode>;
  end: boolean;
}

const INSERT = ['Follow the existing child', 'Create a new node'];
const LEGEND: TreeLegend = { active: 'current', marked: 'end of a word' };
const VOCABULARY = ['car', 'card', 'care', 'cart', 'cat', 'do', 'dog', 'dot', 'dove', 'bat', 'bath', 'bad'];

const CODE = [
  'function buildAndSearch(words, query) {',
  '  const root = {};',
  '  for (const word of words) {',
  '    let node = root;',
  '    for (const ch of word) {',
  '      node[ch] ??= {}; // create only if missing',
  '      node = node[ch];',
  '    }',
  '    node.end = true;',
  '  }',
  '  let node = root;',
  '  for (const ch of query) {',
  '    if (!node[ch]) return false;',
  '    node = node[ch];',
  '  }',
  '  return node.end === true;',
  '}',
];

const SPANS = spansOf(CODE, {
  2: 'const root = {}',
  4: 'let node = root',
  6: 'node[ch] ??= {}',
  7: 'node = node[ch]',
  9: 'node.end = true',
  11: 'let node = root',
  13: 'if (!node[ch]) return false',
  14: 'node = node[ch]',
  16: 'return node.end === true',
});

export const trie: AlgorithmDefinition<Input> = {
  code: CODE,
  fields: [
    { key: 'words', label: 'Words', kind: 'words', hint: 'Up to 7, letters only' },
    { key: 'query', label: 'Search for', kind: 'text' },
  ],
  defaultInput: { words: ['car', 'cat', 'card', 'dog', 'do'], query: 'card' },
  presets: [
    { label: 'A word inside a word', input: { words: ['card', 'car'], query: 'car' } },
    { label: 'Only a prefix', input: { words: ['dove', 'dot'], query: 'do' } },
    { label: 'No word starts that way', input: { words: ['bat', 'dog', 'cat'], query: 'cow' } },
  ],

  randomInput(rand = Math.random) {
    const pool = [...VOCABULARY];
    const words: string[] = [];
    const count = randInt(rand, 3, 6);
    while (words.length < count) words.push(pool.splice(randInt(rand, 0, pool.length - 1), 1)[0]);
    const pick = rand();
    const query =
      pick < 0.5
        ? words[randInt(rand, 0, words.length - 1)]
        : pick < 0.75
          ? VOCABULARY[randInt(rand, 0, VOCABULARY.length - 1)]
          : words[0].slice(0, 2);
    return { words, query };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    const query = asText(
      String(raw['query'] ?? '')
        .trim()
        .toLowerCase(),
      'query',
    );
    return { words: asWords(raw['words'], 'words'), query: asWords([query], 'query')[0] };
  },

  trace({ words, query }) {
    const frames: Frame[] = [];
    const root: TrieNode = { id: 'root', label: '•', parent: null, children: new Map(), end: false };
    const all: TrieNode[] = [root];
    let node = root;
    let word = '';
    let position = -1;

    const tree = (): TreeView => ({
      nodes: all.map((t) => ({ id: t.id, label: t.label, parent: t.parent, state: t === node ? 'active' : 'idle', marked: t.end })),
      legend: LEGEND,
    });
    let chapter = 'Set up';
    const snap = (line: number, caption: string, note: string, extra: Partial<Frame> = {}) =>
      frames.push({
        line,
        caption,
        note,
        chapter,
        span: SPANS[line],
        vars: { word: word || null, ch: position >= 0 && position < word.length ? word[position] : null, 'nodes so far': all.length },
        array: word ? { values: [...word], pointers: position >= 0 && position < word.length ? { ch: position } : {} } : undefined,
        tree: tree(),
        ...extra,
      });

    snap(
      2,
      'Start with an empty root: each edge below it will stand for one letter.',
      'An empty root. Each edge below it will stand for one letter.',
    );

    for (const [k, w] of words.entries()) {
      word = w;
      node = root;
      position = -1;
      chapter = `Insert word ${k + 1}: ${w}`;
      snap(4, `Insert "${w}": start ${k ? 'again ' : ''}at the root.`, `Insert "${w}": start at the root.`);
      for (position = 0; position < w.length; position++) {
        const ch = w[position];
        const exists = node.children.has(ch);
        const prefix = w.slice(0, position);
        snap(
          6,
          `At ${prefix ? `"${prefix}"` : 'the root'}, look for a child "${ch}".`,
          `At "${prefix || 'root'}", look for a child "${ch}".`,
          all.length > 1
            ? {
                predict: {
                  prompt: `Inserting "${w}": what does insert do at ${prefix ? `"${prefix}"` : 'the root'} for "${ch}"?`,
                  ...fixedChoices(INSERT, exists ? 0 : 1),
                  explain: exists
                    ? `An earlier word already starts with "${prefix}${ch}", so the path is shared: no new node.`
                    : `No earlier word continues "${prefix}" with "${ch}", so the word branches off here.`,
                },
              }
            : { lens: exists ? `node['${ch}'] exists` : `node['${ch}'] ??= {} → new node` },
        );
        if (!exists) {
          const child: TrieNode = { id: `${node.id}/${ch}`, label: ch, parent: node.id, children: new Map(), end: false };
          node.children.set(ch, child);
          all.push(child);
        }
        node = node.children.get(ch)!;
        snap(
          7,
          exists
            ? `"${prefix}${ch}" is already there, so share it and move down.`
            : `No "${ch}" under ${prefix ? `"${prefix}"` : 'the root'}, so create "${prefix}${ch}" and move to it.`,
          exists ? `Shared prefix: move down to "${prefix}${ch}".` : `Created "${prefix}${ch}" and moved to it.`,
          { lens: `node = node['${ch}']` },
        );
      }
      node.end = true;
      snap(9, `"${w}" ends here, so mark its last node as a whole word.`, `Mark "${w}" as a complete word (ringed).`, {
        lens: 'node.end = true',
      });
    }

    word = query;
    node = root;
    position = -1;
    chapter = `Search "${query}"`;
    snap(11, `Search for "${query}": walk down from the root, one letter at a time.`, `Search for "${query}": walk down letter by letter.`);
    let found = true;
    for (position = 0; position < query.length; position++) {
      const ch = query[position];
      if (!node.children.has(ch)) {
        const where = position ? `"${query.slice(0, position)}"` : 'the root';
        chapter = 'Not found';
        snap(
          13,
          `No child "${ch}" under ${where}, so "${query}" is not in the trie.`,
          `No child "${ch}" under "${query.slice(0, position) || 'root'}": "${query}" is not in the trie.`,
          { lens: `!node['${ch}'] → true` },
        );
        found = false;
        break;
      }
      node = node.children.get(ch)!;
      snap(
        14,
        position ? `Follow "${ch}" down to "${query.slice(0, position + 1)}".` : `Follow "${ch}" down from the root.`,
        `Follow "${ch}".`,
        { lens: `node = node['${ch}']` },
      );
    }
    if (found) {
      found = node.end;
      chapter = found ? 'Result' : 'Not a word';
      snap(
        16,
        found
          ? `Reached "${query}", and it is marked as a word: return true.`
          : `Reached "${query}", but it only starts longer words: return false.`,
        found
          ? `Reached "${query}" and it is marked as a word: found. The walk took ${query.length} steps no matter how many words are stored.`
          : `Reached "${query}", but it is only a prefix of longer words, not a word itself.`,
        { lens: `node.end === true → ${found}` },
      );
    }
    frames[frames.length - 1].vars['result'] = found;
    return frames;
  },
};
