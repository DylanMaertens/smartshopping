export type StoreCategory = {
  id: string;
  name: string;
  orderIndex: number;
  icon: string;
  keywords: string[];
};

export type CategoryResult = {
  categoryId: string;
  categoryName: string;
  confidence: number;
};

export const STORE_CATEGORIES: StoreCategory[] = [
  { id: 'fruits-legumes', name: 'Fruits & légumes', orderIndex: 10, icon: 'carrot', keywords: ['fruit', 'legume', 'légume', 'salade', 'tomate', 'pomme', 'banane'] },
  { id: 'boulangerie', name: 'Boulangerie', orderIndex: 20, icon: 'bread', keywords: ['pain', 'baguette', 'brioche', 'croissant', 'viennoiserie'] },
  { id: 'cremerie', name: 'Crémerie & produits laitiers', orderIndex: 30, icon: 'milk', keywords: ['lait', 'yaourt', 'fromage', 'beurre', 'creme', 'crème', 'laitier'] },
  { id: 'boucherie-poissonnerie', name: 'Boucherie & poissonnerie', orderIndex: 40, icon: 'drumstick', keywords: ['viande', 'poulet', 'boeuf', 'bœuf', 'porc', 'jambon', 'poisson', 'saumon', 'thon'] },
  { id: 'surgeles', name: 'Surgelés', orderIndex: 50, icon: 'snowflake', keywords: ['surgelé', 'surgele', 'glace', 'pizza surgel', 'frozen'] },
  { id: 'epicerie-salee', name: 'Épicerie salée', orderIndex: 60, icon: 'wheat', keywords: ['pates', 'pâtes', 'riz', 'huile', 'sel', 'conserve', 'sauce', 'chips', 'farine'] },
  { id: 'epicerie-sucree', name: 'Épicerie sucrée', orderIndex: 70, icon: 'cookie', keywords: ['sucre', 'chocolat', 'biscuit', 'cereale', 'céréale', 'confiture', 'miel', 'dessert'] },
  { id: 'boissons', name: 'Boissons', orderIndex: 80, icon: 'bottle', keywords: ['eau', 'jus', 'soda', 'cafe', 'café', 'the', 'thé', 'boisson', 'biere', 'bière'] },
  { id: 'hygiene-beaute', name: 'Hygiène & beauté', orderIndex: 90, icon: 'sparkles', keywords: ['shampooing', 'savon', 'dentifrice', 'deodorant', 'déodorant', 'hygiene', 'hygiène'] },
  { id: 'entretien-maison', name: 'Entretien maison', orderIndex: 100, icon: 'spray-can', keywords: ['lessive', 'nettoyant', 'vaisselle', 'essuie-tout', 'papier toilette', 'menage', 'ménage'] },
  { id: 'bebe', name: 'Bébé', orderIndex: 110, icon: 'baby', keywords: ['couche', 'bebe', 'bébé', 'lingette', 'petit pot'] },
  { id: 'animaux', name: 'Animaux', orderIndex: 120, icon: 'paw-print', keywords: ['chat', 'chien', 'croquette', 'litiere', 'litière', 'animal'] },
  { id: 'non-alimentaire', name: 'Non alimentaire', orderIndex: 130, icon: 'package', keywords: ['pile', 'ampoule', 'sac', 'alu', 'film alimentaire'] },
  { id: 'non-categorise', name: 'À classer', orderIndex: 999, icon: 'circle-help', keywords: [] },
];

export function classifyProductLocally(productName: string, tags: string[] = []): CategoryResult {
  const haystack = normalize(`${productName} ${tags.join(' ')}`);

  const category = STORE_CATEGORIES.find((candidate) => {
    if (candidate.id === 'non-categorise') return false;
    return candidate.keywords.some((keyword) => haystack.includes(normalize(keyword)));
  });

  const selected = category ?? STORE_CATEGORIES[STORE_CATEGORIES.length - 1];

  return {
    categoryId: selected.id,
    categoryName: selected.name,
    confidence: category ? 0.82 : 0.2,
  };
}

function normalize(input: string) {
  return input
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/[éèê]/g, 'e')
    .replace(/à/g, 'a')
    .replace(/ç/g, 'c')
    .replace(/œ/g, 'oe');
}
