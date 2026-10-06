import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyProductLocally } from './categoryService';

describe('classifyProductLocally', () => {
  it('classe les accents et variantes dans un rayon générique', () => {
    expect(classifyProductLocally('Crème fraîche').categoryName).toBe('Crémerie & produits laitiers');
    expect(classifyProductLocally('Pâtes complètes').categoryName).toBe('Épicerie salée');
  });

  it('utilise les tags et conserve un fallback explicite', () => {
    expect(classifyProductLocally('Produit', ['boisson']).categoryName).toBe('Boissons');
    expect(classifyProductLocally('Objet mystérieux')).toEqual({
      categoryId: 'non-categorise',
      categoryName: 'À classer',
      confidence: 0.2,
    });
  });
});

// Both classifiers run the same examples, so a scanned product and a typed name agree.
const examples: { name: string; tags: string[]; categoryId: string }[] = JSON.parse(
  readFileSync(new URL('../../../../tests/fixtures/category-examples.json', import.meta.url), 'utf8'),
);
it.each(examples)('classe $name dans $categoryId', ({ name, tags, categoryId }) => {
  expect(classifyProductLocally(name, tags).categoryId).toBe(categoryId);
});
