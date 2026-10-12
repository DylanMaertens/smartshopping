# Poduna — kit d’identité v1

Panier tressé arrondi retenu par Dylan, redessiné manuellement en courbes SVG à partir de `output/imagegen/poduna/poduna-tressage-arrondi-v2.png` (même concept que l’image jointe à la validation).

Le dessin conserve l’anse, le bord évidé, la silhouette et les rubans courbes du concept. Les courbes ont été régularisées ; le SVG n’est pas une image bitmap encapsulée. Les découpes sont réellement transparentes, sans aplats blancs simulant des trous. Aucune nouvelle génération IA n’a été utilisée pour cette vectorisation.

## Fichiers à utiliser

- `svg/poduna-symbol-green.svg` : symbole principal, transparent et redimensionnable.
- `svg/poduna-symbol-ivory.svg` : symbole inversé pour fond sombre.
- `svg/poduna-symbol-black.svg` : version monochrome.
- `svg/poduna-logo-{green,ivory,black}.svg` : panier + nom Poduna, lettres converties en tracés. Aucune police requise pour les afficher.
- `png/` : équivalents transparents, symbole 1024 px et logo horizontal 1720 px.
- `icons/app-icon-{256,512,1024}.png` : icône claire opaque, sans coins artificiellement arrondis.
- `icons/app-icon-inverse-1024.png` : variante ivoire sur vert.
- `icons/apple-touch-icon.png` : 180 × 180 px, fond opaque.
- `icons/favicon.ico` : trois tailles incluses, 16/32/48 px ; fond ivoire pour garder le contraste.
- `icons/favicon.svg` : petit symbole vert transparent ; `favicon-ivory.svg` pour un fond sombre maîtrisé.
- `icons/android-foreground.svg` et `android-foreground-432.png` : avant-plan ivoire transparent à associer à un arrière-plan uni `#245C46` pour une future icône adaptative. Ce sont des ressources préparées, pas une configuration Android installée.
- `preview/brand-board.png` : planche de présentation.
- `preview/small-sizes.png` : comparaison aux tailles 16/24/32/48/64 px, puis agrandissement × 6 sans lissage. Ligne supérieure : dessin complet ; ligne inférieure : petite variante.

## Usage

Palette : vert `#245C46`, ivoire `#FAF8F3`. Ne pas étirer ni ajouter d’ombre ou de dégradé. Garder les marges intégrées autour du symbole. Sur fond sombre, utiliser la version ivoire.

Le tressage principal reste la référence. Pour les favicons, la variante optique a un bord plein et des ouvertures plus grandes ; c’est une adaptation de lisibilité, pas un remplacement du dessin choisi. Préférer le symbole complet à partir de 48 px de hauteur visible et le logo horizontal à partir d’environ 240 px de largeur. Ces repères sont issus du contrôle visuel, pas d’un test utilisateur sur téléphone.

Lettrage proposé : **Fira Sans Medium**, « Poduna », avec approche resserrée. Les sources `source/lockup-*-editable.svg` gardent le texte éditable ; les exports `svg/` le vectorisent. La licence SIL OFL de la police est conservée dans `licenses/FiraSans-OFL.txt`. Le choix typographique reste ajustable indépendamment du panier validé.

## Régénération et contrôle

Sources de référence : `source/symbol.svg` et `source/symbol-small.svg`. Le script produit seulement les fichiers de ce kit ; il ne touche ni au site ni à l’application.

Prérequis : Node.js, module `sharp`, `rsvg-convert`, Fontconfig, police Fira Sans Medium installée. Le script refuse une substitution de police. Si `sharp` est installé hors de la résolution habituelle, définir `NODE_PATH` vers son répertoire de modules.

```sh
node build.cjs
node verify.cjs
```

Contrôles : SVG sans bitmap et sans texte dépendant d’une police, dimensions des PNG, fond opaque des icônes, transparence des symboles, trois images valides dans l’ICO, dessin adaptatif contenu dans le cercle central de sécurité 66/108. Inspection visuelle de la planche et des petites tailles effectuée.

Résultat du contrôle automatisé : **19 vérifications réussies**. Rayon maximal du dessin d’avant-plan : 128,5 px pour une limite de 132 px dans le PNG 432 px. Les proportions 108/66 suivent la [documentation officielle Android des icônes adaptatives](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive), consultée le 8 octobre 2026. Le contrôle circulaire est une marge conservatrice supplémentaire. Un essai sur appareil reste à faire lors de l’intégration.

## Périmètre

Kit préparé uniquement : aucun renommage du projet, aucune intégration dans le site ou l’app, aucun APK produit. Les essais précédents sont conservés. La disponibilité du nom Poduna et la recherche d’antériorité du signe ne sont pas validées par ce travail graphique.
