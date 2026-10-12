import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalCategoryId, canonicalCategoryName, classifyProductLocally, STORE_CATEGORIES } from './categoryService';

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
  expect(classifyProductLocally(name, tags).categoryId).toBe(canonicalCategoryId(categoryId));
});

it('offers 27 aisles and maps retired labels, IDs and old server results to their merged aisle', () => {
  expect(STORE_CATEGORIES).toHaveLength(27);
  const aliases = [
    ['alimentation-animale', 'Alimentation animale', 'animaux', 'Animaux'],
    ['accessoires-animaux', 'Accessoires & hygiène des animaux', 'animaux', 'Animaux'],
    ['soins-cheveux', 'Soins des cheveux', 'soins-visage-corps', 'Soins visage, corps & cheveux'],
    ['soins-visage-corps', 'Soins du visage & du corps', 'soins-visage-corps', 'Soins visage, corps & cheveux'],
    ['maquillage-parfums', 'Maquillage & parfums', 'hygiene-beaute', 'Hygiène & beauté'],
    ['premiers-soins', 'Premiers soins', 'premiers-soins', 'Parapharmacie'],
  ];
  for (const [oldId, oldName, id, name] of aliases) {
    expect(canonicalCategoryId(oldId)).toBe(id);
    expect(canonicalCategoryName(oldName)).toBe(name);
    for (const tag of [oldId, oldName, name]) {
      expect(classifyProductLocally('Marque inconnue', [tag])).toMatchObject({ categoryId: id, categoryName: name });
    }
  }
});

it('classifies singularized product phrases without losing a specific aisle', () => {
  expect(classifyProductLocally('Orange').categoryName).toBe('Fruits & légumes');
  expect(classifyProductLocally('Sac à déjections').categoryName).toBe('Animaux');
  expect(classifyProductLocally('Brosse à dents').categoryName).toBe('Hygiène bucco-dentaire');
  expect(classifyProductLocally('Serviette hygiénique').categoryName).toBe('Hygiène & beauté');
});
