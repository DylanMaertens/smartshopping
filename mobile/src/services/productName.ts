// A bounded French product lexicon, not a blanket removal of final s/x.
// Natural collective names (pâtes, riz, petits pois, épinards, céréales, etc.)
// and unfamiliar brands/languages deliberately remain unchanged.
const nouns = `abricot amande artichaut asperge aubergine avocat banane betterave biscuit
brocoli brioche carotte cerise champignon châtaigne chou citron clémentine compote
confiture concombre cornichon courge courgette crabe crevette croissant datte échalote
endive figue flocon fraise framboise fromage galette haricot huile kiwi laitue lardon
mandarine mangue melon navet nectarine noisette nouille œuf oeuf oignon olive orange
pain pêche poire poireau poivron pomme poulet prune pruneau raisin radis salade sardine
saucisse saucisson steak tomate truite yaourt yogourt gâteau bonbon cacahuète glace
glaçon sorbet bière bouteille pot sachet rouleau paquet boîte conserve pizza
pansement compresse couche lingette serviette tampon protection savon shampooing
shampoing déodorant dentifrice brosse rasoir éponge sac poubelle gamelle croquette
friandise complément vitamine ampoule pile chargeur câble cahier carnet stylo crayon
enveloppe feutre gomme tournevis écrou boulon cheville pinceau marteau jouet jeu livre
puzzle assiette casserole spatule passoire torchon drap taie chaussette chemise pantalon
chaussure verre vêtement mouchoir yaourtière fruit légume viande poisson baguette
viennoiserie crème yaourt sauce dessert thé café tablette barre liqueur sirop jus
tranche portion bouteille gourde shampooing masque coloration laque parfum démaquillant
baume sérum gel trousse thermomètre sparadrap couverture housse coussin tapis
laisse collier panier aquarium arbre plante graine semence arrosoir tuyau pelle
raquette ballon magazine roman bocal couteau rouleau tube capsule gélule comprimé`.split(/\s+/u);
const plurals = new Map(nouns.map((noun) => [noun + 's', noun]));
for (const [plural, singular] of Object.entries({ choux: 'chou', poireaux: 'poireau',
  gâteaux: 'gâteau', gateaux: 'gateau', pinceaux: 'pinceau', marteaux: 'marteau', jeux: 'jeu',
  bocaux: 'bocal', couteaux: 'couteau', eaux: 'eau', tuyaux: 'tuyau' })) plurals.set(plural, singular);
// Also accept unaccented keyboard input, without merging different accented names.
for (const [plural, singular] of [...plurals]) {
  plurals.set(plural.normalize('NFD').replace(/\p{M}/gu, ''), singular.normalize('NFD').replace(/\p{M}/gu, ''));
}
const adjectives = new Map(Object.entries({ verts: 'vert', vertes: 'verte', rouges: 'rouge',
  jaunes: 'jaune', blancs: 'blanc', blanches: 'blanche', noirs: 'noir', noires: 'noire',
  frais: 'frais', fraîches: 'fraîche', fraiches: 'fraiche', secs: 'sec', sèches: 'sèche',
  seches: 'seche', entiers: 'entier', entières: 'entière', entieres: 'entiere',
  complets: 'complet', complètes: 'complète', completes: 'complete', surgelés: 'surgelé',
  surgelées: 'surgelée', surgeles: 'surgele', surgelees: 'surgelee', râpés: 'râpé',
  râpées: 'râpée', rapes: 'rape', rapees: 'rapee', stériles: 'stérile', steriles: 'sterile',
  alimentaires: 'alimentaire', hygiéniques: 'hygiénique', hygieniques: 'hygienique' }));

/** The head noun only, then known adjacent adjectives: never the contents of a pack
 * or a complement such as “aux fruits”, “à dents” or “pour chats”. */
export function singularizeProductName(value: string): string {
  const words = value.split(' ');
  const singular = plurals.get(words[0]);
  if (!singular) return value;
  words[0] = singular;
  for (let index = 1; index < words.length; index++) {
    const adjective = adjectives.get(words[index]);
    if (!adjective) break;
    words[index] = adjective;
  }
  return words.join(' ');
}
