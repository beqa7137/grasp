import * as ionicons from 'ionicons/icons';
import * as icons from './icons';

/** Ionicons' names for a glyph: some share one drawing, as checkmark and checkmarkOutline do. */
const sourceNames = (glyph: string) => Object.entries(ionicons).flatMap(([name, value]) => (value === glyph ? [name] : []));

describe('the icon map', () => {
  const concepts = Object.entries(icons);

  it('uses outline glyphs, with filled ones only for state', () => {
    for (const [concept, glyph] of concepts) {
      const names = sourceNames(glyph);
      expect(names.length, concept).toBeGreaterThan(0);
      if (!concept.endsWith('StateIcon'))
        expect(
          names.some((name) => name.endsWith('Outline')),
          concept,
        ).toBe(true);
    }
    expect(concepts.filter(([concept]) => concept.endsWith('StateIcon')).length).toBeGreaterThan(0);
  });

  it('gives each concept its own glyph', () => {
    expect(new Set(concepts.map(([, glyph]) => glyph)).size).toBe(concepts.length);
  });
});
