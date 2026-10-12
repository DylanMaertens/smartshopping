// Offline shopping vocabulary, not a general spellchecker. Singulars matter for OCR.
export const OCR_WORDS = `
abricot abricots ail amande amandes ananas anchois artichaut artichauts asperge asperges
aubergine aubergines avocat avocats banane bananes basilic beurre betterave betteraves
biscuit biscuits bœuf brocoli brocolis brioche brioches cabillaud cacao café carotte carottes
cassonade céleri céréales cerise cerises champignon champignons châtaigne châtaignes
chips chocolat chou choux ciboulette cidre citron citrons clémentine clémentines compote
confiture concombre concombres coriandre cornichon cornichons courge courges courgette courgettes
crabe crème crevette crevettes croissant croissants cumin curcuma curry datte dattes
échalote échalotes emmental endive endives épinards farine fenouil figue figues flocon flocons
fraise fraises framboise framboises fromage fromages galette galettes gingembre gruyère
haricot haricots huile huiles jambon kiwi kiwis lait laitue lardon lardons lasagnes
spaghetti spaghettis coquillette coquillettes macaroni macaronis tagliatelle tagliatelles
vermicelle vermicelles penne fusilli
lentille lentilles légume légumes levure limonade maïs mandarine mandarines mangue mangues margarine
melon miel moutarde mozzarella muesli navet navets nectarine nectarines noisette noisettes
noix nouille nouilles œuf œufs oignon oignons olive olives orange oranges origan pain pains
paprika parmesan pâte pâtes pâté pêche pêches persil petits pois poire poires poireau poireaux
poivre poivron poivrons pomme pommes poulet prune prunes pruneau pruneaux quinoa radis
raisin raisins ravioli raviolis ricotta riz roquette rosé rôti salade salades sardine sardines
saucisse saucisses saucisson saumon semoule sirop soja soupe steak steaks sucre surgelés
thé thon thym tomate tomates truite vanille veau viande viandes vinaigre yaourt yaourts
eau eaux bière bières vin vins whisky vodka rhum jus soda sodas tofu houmous mascarpone
gel glace glaces glaçon glaçons sorbet sorbets gâteau gâteaux bonbon bonbons cacahuète cacahuètes
blanc blanche blancs complet complète complets complètes frais fraîche fraîches
noir noire noirs vert verte verts rouge rouges râpé râpée doux douce bio nature entier entière
demi écrémé écrémée liquide poudre tranche tranches boîte boîtes bouteille bouteilles pot pots
sachet sachets rouleau rouleaux paquet paquets kilo kilos grammes litre litres sans avec pour terre
dentifrice déodorant lessive lingette lingettes savon savons shampooing shampoing douche
papier toilette mouchoir mouchoirs essuie tout éponge éponges liquide vaisselle nettoyant
feuille feuilles
javel désinfectant adoucissant détartrant sac sacs poubelle poubelles aluminium film cuisson
brosse brosses coton cotons tige tiges rasoir rasoirs serviette serviettes tampon tampons
couche couches protection protections solaire pansement pansements pile piles ampoule ampoules
croquette croquettes litière pâtée friandise friandises chat chats chien chiens complément
compléments alimentaire alimentaires vitamine vitamines magnésium protéine protéines
`.trim().split(/\s+/u);

// Common brands should never become a nearby food through batch acceptance.
export const OCR_PROTECTED_WORDS = `Sanex Nutella Danone Activia Actimel Lindt Milka Nivea
Dove Ariel Persil Lenor Skip Dash Haribo Barilla Panzani Evian Volvic Vittel Cristaline
Perrier Badoit Coca Pepsi Fanta Oasis Lipton Nestlé Kellogg Heudebert Bjorg Alpro
Bonduelle Fleury Michon Herta Knorr Maggi Ducros Amora Heinz Lustucru Boursin Kiri
Babybel Président Lactel Candia Purina Whiskas Felix Sheba Pedigree Royal Canin`.split(/\s+/u);
