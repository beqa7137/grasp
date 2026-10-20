/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import { QUESTION_PROMPTS } from '../behavioral/question-prompts.js';
import { COMPETENCIES } from '../behavioral/competencies.js';
import { questionPromptsSource, searchDataSource } from './build-index.js';
import { CUE_WORDS, PRODUCT_NAMES, SEARCH_ALIASES } from './keywords.js';
import { SEARCH_INDEX } from './search.js';
import { SEARCH_KINDS } from './types.js';

/** What `npm run gen:search` would write to `file`, formatted as the repository formats it. */
async function generated(file: string, source: string): Promise<string> {
  const path = fileURLToPath(new URL(file, import.meta.url));
  return format(source, { ...(await resolveConfig(path)), filepath: path });
}

const committed = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

describe('the search index', () => {
  it('is generated from the current catalogs: run `npm run gen:search` when this fails', async () => {
    expect(committed('./index.data.ts')).toBe(await generated('./index.data.ts', searchDataSource()));
    expect(committed('../behavioral/question-prompts.data.ts')).toBe(
      await generated('../behavioral/question-prompts.data.ts', questionPromptsSource()),
    );
  });

  it('holds every question prompt with its competency, without the guides', () => {
    const questions = COMPETENCIES.flatMap((c) => c.questions);
    expect(QUESTION_PROMPTS).toEqual(questions.map(({ id, competencyId, prompt }) => ({ id, competencyId, prompt })));
    expect(SEARCH_INDEX.question).toHaveLength(91);
  });

  it('gives each item of a kind its own id', () => {
    for (const kind of SEARCH_KINDS) expect(new Set(SEARCH_INDEX[kind].map(([id]) => id)).size, kind).toBe(SEARCH_INDEX[kind].length);
  });

  it('points every alias and cue word at an item that exists', () => {
    const ids = new Set(SEARCH_KINDS.flatMap((kind) => SEARCH_INDEX[kind].map(([id]) => `${kind}:${id}`)));
    for (const key of [...Object.keys(SEARCH_ALIASES), ...Object.keys(CUE_WORDS), ...Object.keys(PRODUCT_NAMES)])
      expect(ids.has(key), key).toBe(true);
  });

  it('tags rows only with ids of the kind their tags name', () => {
    const ids = (kind: keyof typeof SEARCH_INDEX) => new Set(SEARCH_INDEX[kind].map(([id]) => id));
    const named = {
      problem: ids('pattern'),
      visualizer: ids('pattern'),
      mission: ids('topic'),
      case: ids('topic'),
      question: ids('competency'),
    };
    for (const [kind, known] of Object.entries(named))
      for (const [id, , , tags = []] of SEARCH_INDEX[kind as keyof typeof named])
        for (const tag of tags) expect(known.has(tag), `${kind}:${id} ${tag}`).toBe(true);
    for (const [id, , , tags] of SEARCH_INDEX.mock) expect(['coding', 'system-design'], id).toContain(tags?.[0]);
    for (const [path, , , tags] of SEARCH_INDEX.page) expect(['coding', 'design', 'behavioral', 'app'], path).toContain(tags?.[0]);
  });
});
