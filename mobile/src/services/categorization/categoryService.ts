import productCategoryTags from './productCategoryTags.json';
import catalogueTaxonomies from './catalogueTaxonomies.json';

const taxonomySources: Record<string, Record<string, string | null>> = catalogueTaxonomies.sources;

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
  { id: 'epicerie-salee', name: 'Épicerie salée', orderIndex: 60, icon: 'wheat', keywords: ['pates', 'pâtes', 'riz', 'huile', 'vinaigre', 'sel', 'conserve', 'sauce', 'chips', 'farine'] },
  { id: 'epicerie-sucree', name: 'Épicerie sucrée', orderIndex: 70, icon: 'cookie', keywords: ['sucre', 'chocolat', 'biscuit', 'cereale', 'céréale', 'confiture', 'miel', 'dessert'] },
  { id: 'alcools', name: 'Alcools', orderIndex: 85, icon: 'wine', keywords: ['vin', 'vins', 'bière', 'bières', 'cidre', 'champagne', 'prosecco', 'rhum', 'whisky', 'whiskey', 'vodka', 'gin', 'tequila', 'cognac', 'liqueur', 'pastis', 'porto', 'apéritif', 'boisson alcoolisée'] },
  { id: 'boissons', name: 'Boissons', orderIndex: 80, icon: 'bottle', keywords: ['eau', 'jus', 'soda', 'cafe', 'café', 'the', 'thé', 'boisson', 'biere', 'bière'] },
  { id: 'hygiene-beaute', name: 'Hygiène & beauté', orderIndex: 90, icon: 'sparkles', keywords: ['shampooing', 'savon', 'dentifrice', 'deodorant', 'déodorant', 'hygiene', 'hygiène'] },
  { id: 'entretien-maison', name: 'Entretien maison', orderIndex: 100, icon: 'spray-can', keywords: ['lessive', 'nettoyant', 'vaisselle', 'essuie-tout', 'papier toilette', 'menage', 'ménage'] },
  { id: 'bebe', name: 'Bébé', orderIndex: 110, icon: 'baby', keywords: ['couche', 'bebe', 'bébé', 'lingette', 'petit pot'] },
  { id: 'animaux', name: 'Animaux', orderIndex: 120, icon: 'paw-print', keywords: ['chat', 'chien', 'croquette', 'litiere', 'litière', 'animal'] },
  { id: "papeterie-bureau", name: "Papeterie & fournitures de bureau", orderIndex: 130, icon: "notebook-pen", keywords: ["papeterie", "fournitures scolaires", "fournitures de bureau", "stylo", "stylos", "crayon", "crayons", "cahier", "cahiers", "carnet", "carnets", "classeur", "classeurs", "agrafeuse", "agrafes", "trombone", "trombones", "papier imprimante", "papier a4", "imprimante", "enveloppe", "enveloppes", "feutre", "feutres", "gomme à effacer", "colle scolaire", "post-it"] },
  { id: "bricolage-quincaillerie", name: "Bricolage & quincaillerie", orderIndex: 140, icon: "hammer", keywords: ["bricolage", "quincaillerie", "vis", "écrou", "écrous", "boulon", "boulons", "cheville", "chevilles", "tournevis", "marteau", "pinceau", "pinceaux", "peinture", "perceuse", "ruban adhésif", "papier de verre", "clé à molette"] },
  { id: "jardin-exterieur", name: "Jardin & extérieur", orderIndex: 150, icon: "sprout", keywords: ["jardin", "jardinage", "terreau", "engrais", "semences", "graines à semer", "arrosoir", "sécateur", "râteau", "pelle de jardin", "pot de fleurs", "pots de fleurs", "plante verte", "plantes vertes", "tuyau d’arrosage", "tondeuse à gazon"] },
  { id: "auto-moto", name: "Auto & moto", orderIndex: 160, icon: "car", keywords: ["voiture", "voitures", "automobile", "moto", "motos", "pneu", "pneus", "lave-glace", "essuie-glace", "essuie-glaces", "huile moteur", "huile pour moteur", "liquide de refroidissement", "liquide de frein", "nettoyant jantes", "antigel", "batterie auto", "ampoule auto"] },
  { id: 'non-alimentaire', name: 'Non alimentaire', orderIndex: 170, icon: 'package', keywords: ['pile', 'ampoule', 'sac', 'alu', 'film alimentaire'] },
  {"id": "soins-cheveux", "name": "Soins des cheveux", "orderIndex": 91, "icon": "scissors", "keywords": ["shampooing", "shampoing", "après shampooing", "après shampoing", "masque cheveux", "coloration cheveux", "laque cheveux", "huile cheveux", "soin capillaire", "soins capillaires", "gel coiffant"]},
  {"id": "soins-visage-corps", "name": "Soins du visage & du corps", "orderIndex": 92, "icon": "sparkles", "keywords": ["crème visage", "crème pour le visage", "crème mains", "crème pour les mains", "crème hydratante", "lait corporel", "lait de toilette", "gel douche", "savon", "déodorant", "protection solaire", "crème solaire", "baume à lèvres", "huile de massage", "sérum visage"]},
  {"id": "hygiene-dentaire", "name": "Hygiène bucco-dentaire", "orderIndex": 93, "icon": "smile", "keywords": ["dentifrice", "brosse à dents", "brosses à dents", "bain de bouche", "bains de bouche", "fil dentaire", "solution dentaire"]},
  {"id": "maquillage-parfums", "name": "Maquillage & parfums", "orderIndex": 94, "icon": "palette", "keywords": ["maquillage", "mascara", "rouge à lèvres", "fond de teint", "vernis à ongles", "démaquillant", "parfum", "eau de toilette", "eau de parfum", "pinceau maquillage", "pinceau de maquillage"]},
  {"id": "alimentation-animale", "name": "Alimentation animale", "orderIndex": 121, "icon": "paw-print", "keywords": ["croquette", "croquettes", "pâtée pour chat", "pâtée pour chien", "friandises pour chat", "friandises pour chien", "friandises au poulet pour chat", "nourriture pour chat", "nourriture pour chien", "nourriture pour poissons", "graines pour oiseaux", "foin pour lapin"]},
  {"id": "accessoires-animaux", "name": "Accessoires & hygiène des animaux", "orderIndex": 122, "icon": "paw-print", "keywords": ["litière", "gamelle", "gamelles", "laisse pour chien", "collier pour chien", "collier pour chat", "jouet pour chien", "jouet pour chat", "shampooing pour chien", "shampooing pour chat", "shampoing pour chien", "shampoing pour chat", "brosse pour chien", "brosse pour chat", "panier pour chien", "panier pour chat", "sacs à déjections"]},
  {"id": "maison-cuisine", "name": "Maison & cuisine", "orderIndex": 180, "icon": "house", "keywords": ["casserole", "casseroles", "poêle de cuisson", "poêle à frire", "assiette", "assiettes", "couverts", "spatule", "passoire", "moule à gâteau", "boîte de conservation", "film alimentaire", "papier aluminium", "papier cuisson", "sac congélation", "sacs congélation", "verre à eau", "verres à eau"]},
  {"id": "vetements-linge", "name": "Vêtements & linge", "orderIndex": 190, "icon": "shirt", "keywords": ["vêtement", "vêtements", "t shirt", "t shirts", "chaussette", "chaussettes", "pantalon", "pantalons", "chemise", "chemises", "chaussures", "linge de lit", "drap", "draps", "taie", "taies", "serviette de bain", "torchon", "torchons"]},
  {"id": "electricite-electronique", "name": "Électricité & électronique", "orderIndex": 200, "icon": "plug", "keywords": ["pile", "piles", "ampoule", "ampoules", "chargeur", "chargeurs", "câble usb", "prise électrique", "multiprise", "écouteurs", "casque audio", "batterie externe", "ordinateur", "souris informatique", "clavier informatique"]},
  {"id": "jeux-loisirs", "name": "Jeux & loisirs", "orderIndex": 210, "icon": "puzzle", "keywords": ["jouet", "jouets", "jeu de société", "jeux de société", "puzzle", "puzzles", "livre", "livres", "roman", "romans", "magazine", "magazines", "ballon de football", "ballon de basket", "raquette", "raquettes"]},
  { id: 'non-categorise', name: 'À classer', orderIndex: 999, icon: 'circle-help', keywords: [] },
];

// Specific non-food terms take priority over generic words such as huile or glace.
const specializedIds = new Set(['papeterie-bureau', 'bricolage-quincaillerie', 'jardin-exterieur', 'auto-moto', 'soins-cheveux', 'soins-visage-corps', 'hygiene-dentaire', 'maquillage-parfums', 'alimentation-animale', 'accessoires-animaux', 'maison-cuisine', 'vetements-linge', 'electricite-electronique', 'jeux-loisirs']);
function wholeWords(input: string): string {
  return ` ${normalize(input).split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ')} `;
}

export function classifyProductLocally(productName: string, tags: string[] = [], source?: string): CategoryResult {
  // An already mapped API aisle must not be reinterpreted from the product name.
  const knownTags = tags.map((tag) => normalize(tag.trim()));
  const explicit = STORE_CATEGORIES.find((category) => category.id !== 'non-categorise'
    && knownTags.some((tag) => tag === normalize(category.id) || tag === normalize(category.name)));
  // Rules use exact taxonomy tags, in priority order (e.g. frozen before vegetables).
  const sources = source && taxonomySources[source] ? [taxonomySources[source]] : Object.values(taxonomySources);
  const inherited = new Set(tags.flatMap((tag) => sources.map((taxonomy) => taxonomy[tag.trim().toLowerCase()])).filter(Boolean));
  const rule = tags.length ? productCategoryTags.find((entry) => !(entry.categoryId === 'alcools' && isAlcoholFree([productName, ...tags].join(' ')))
    && (inherited.has(entry.categoryId) || entry.tags.some((tag) => knownTags.includes(normalize(tag))))) : undefined;
  const mapped = explicit ?? STORE_CATEGORIES.find((category) => category.id === rule?.categoryId);
  if (mapped) return { categoryId: mapped.id, categoryName: mapped.name, confidence: 0.95 };
  // Keep category evidence separate: a word in the name cannot outrank a known tag.
  const tagged = classifyWords(tags.join(' '));
  return tagged.categoryId !== 'non-categorise' ? tagged : classifyWords(productName);
}

function classifyWords(value: string): CategoryResult {
  const haystack = normalize(value);

  const words = wholeWords(haystack);
  // Prefer the most specific phrase: "shampooing pour chien" beats "shampooing".
  const specialized = STORE_CATEGORIES.filter((candidate) => specializedIds.has(candidate.id))
    .map((category) => ({ category, score: Math.max(0, ...category.keywords
      .filter((keyword) => words.includes(wholeWords(keyword))).map((keyword) => wholeWords(keyword).length)) }))
    .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score)[0]?.category;
  const alcohol = STORE_CATEGORIES.find((candidate) => candidate.id === 'alcools' && !words.includes(' vinaigre ')
    && candidate.keywords.some((keyword) => words.includes(wholeWords(keyword))));
  const beverage = STORE_CATEGORIES.find((candidate) => candidate.id === 'boissons'
    && candidate.keywords.some((keyword) => words.includes(wholeWords(keyword))));
  const category = specialized ?? (alcohol ? (isAlcoholFree(value) ? STORE_CATEGORIES.find((c) => c.id === 'boissons') : alcohol) : undefined) ?? beverage ?? STORE_CATEGORIES.find((candidate) => {
    if (specializedIds.has(candidate.id)) return false;
    if (candidate.id === 'non-categorise' || candidate.id === 'alcools') return false;
    return candidate.keywords.some((keyword) => haystack.includes(normalize(keyword)));
  });

  const selected = category ?? STORE_CATEGORIES[STORE_CATEGORIES.length - 1];

  return {
    categoryId: selected.id,
    categoryName: selected.name,
    confidence: category ? 0.82 : 0.2,
  };
}

function isAlcoholFree(input: string): boolean {
  return /sans alcool|non alcoholic|alcohol free|\b0(?:[.,]0+)?\s*%/u.test(normalize(input));
}

function normalize(input: string) {
  return input
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/[éèê]/g, 'e')
    .replace(/[àâä]/g, 'a')
    .replace(/[îï]/g, 'i')
    .replace(/[ôö]/g, 'o')
    .replace(/[ùûü]/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/œ/g, 'oe');
}
