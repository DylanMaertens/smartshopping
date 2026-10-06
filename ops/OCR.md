# Importer une liste depuis une photo

Dans la liste souhaitée, choisir **Scanner une liste écrite**, puis **Photographier et reconnaître**. Relire le résultat, corriger les mots et garder un article par ligne avant **Ajouter les articles**. `2 x lait` et `lait x 2` définissent une quantité. Les noms déjà présents augmentent la quantité, après nettoyage des espaces et comparaison sans distinction de majuscules. Une erreur de validation annule tout le lot. L'import utilise la sauvegarde locale et la synchronisation habituelles.

La capture fonctionne avec la caméra d'Expo Go SDK 54. Une connexion au serveur SmartShopping est nécessaire pour reconnaître le texte. Aucun abonnement OCR ni clé d'API externe n'est requis. Le manuscrit reste moins fiable que l'imprimé : la relecture est obligatoire. Une photo nette, bien éclairée, cadrée sur les articles et une ligne par article donnent les meilleures chances de réussite. Les tableaux et les colonnes peuvent nécessiter une remise en ordre manuelle. L'import depuis la galerie n'est pas inclus.

## Installation serveur

Python 3.12 ou 3.13 et les bibliothèques système d'OpenCV sont nécessaires. Sous Debian : `libgl1`, `libglib2.0-0`, `libgomp1`. Installer une fois, depuis la racine du dépôt :

```bash
OCR_SETUP_PYTHON=python3.12 bash ops/install-ocr.sh
```

Le script crée `.local-dev/ocr/venv` et télécharge les modèles (~87 Mo), contrôlés par SHA-256 depuis le manifeste inclus dans RapidOCR 3.9.2. Les dépendances sont figées dans `backend/ocr/requirements.txt`. Les modèles utilisés sont PP-OCRv6 détection small, reconnaissance multilingue medium, classification d'orientation PP-OCRv4. [Manifeste officiel RapidOCR](https://github.com/RapidAI/RapidOCR/blob/main/python/rapidocr/default_models.yaml).

`ops/dev-android.sh` détecte ensuite l'installation au démarrage. **Arrêter le lanceur précédent avec Ctrl+C, puis le relancer** : le worker Python est embarqué dans le binaire Rust à la compilation. Recharger ensuite l'app dans Expo Go. Les données des listes sont conservées.

Pour un serveur lancé autrement, exporter `OCR_PYTHON` (chemin absolu du Python de ce venv) et `OCR_MODELS_DIR` (chemin absolu du répertoire des modèles), puis reconstruire et redémarrer le backend. Le Dockerfile installe également ces dépendances et modèles ; sa construction n'a pas été validée localement lors de cet ajout.

## Traitement et limites

- `POST /api/v1/ocr` utilise les signatures d'appareil existantes. Corps JSON `image_base64` limité à 4 Mio ; image JPEG/PNG décodée limitée à 3 Mio et 12 millions de pixels. Les autres routes conservent 64 Kio.
- Traitement sur le serveur configuré : les photos ne sont pas transmises à un fournisseur OCR externe. Elles passent en mémoire vers le worker et ne sont ni écrites dans des fichiers ni journalisées par le serveur. Expo Camera peut conserver sa capture dans le cache temporaire du téléphone.
- Un traitement à la fois par processus serveur, deux threads CPU, délai maximal de 25 secondes ; le mobile attend au maximum 30 secondes après l'enrôlement éventuel. Un serveur occupé renvoie 429. Les erreurs laissent la liste intacte et proposent une nouvelle photo ou la saisie manuelle.
- Orientation EXIF appliquée, image réduite et marge ajoutée pour les textes cadrés près des bords. Aucun modèle n'est téléchargé pendant la reconnaissance.
- Réponse texte seulement, 20 000 octets maximum. Import limité à 50 lignes, 200 octets UTF-8 par nom et quantités de 1 à 999. Aucun article n'est ajouté avant confirmation.

## Validation du 1er octobre 2026

129 tests mobiles réussis (56 Vitest, 73 Jest), TypeScript conforme. 25 tests Rust par défaut réussis ; test OCR réel supplémentaire réussi. Quatre tests Python vérifient les images invalides, les dimensions excessives, la rotation EXIF et la réduction. Les contrôles de signature, les limites distinctes OCR/sync, la relecture, l'annulation, les doubles appuis et l'import atomique sont couverts.

Essai réel du moteur puis appel HTTP signé sur un serveur temporaire isolé :

- Imprimé français : `Pain`, `2 x lait`, `Pommes`, `Chocolat noir`, `Crème fraîche` reconnus exactement.
- [Échantillon manuscrit public](https://huggingface.co/docs/transformers.js/api/pipelines), attendu « Mr. Brown commented icily. » : obtenu « Mr. Bom commented icily. ». La phrase est reconnue avec une erreur sur le nom ; cela ne prouve pas la qualité de toutes les écritures ni des listes manuscrites françaises.

La capture et les résultats sur téléphone Android réel restent à essayer par l'utilisateur, avec des listes manuscrites françaises et imprimées. Aucune validation physique n'est déclarée à partir des tests automatisés.

Commandes utiles :

```bash
.local-dev/ocr/venv/bin/python -m unittest discover -s backend/ocr -p 'test_*.py'
OCR_PYTHON="$PWD/.local-dev/ocr/venv/bin/python" \
OCR_MODELS_DIR="$PWD/.local-dev/ocr/models" \
TEST_OCR_IMAGE=/chemin/vers/imprime-francais.jpg \
cargo test --locked --manifest-path backend/Cargo.toml --test api_smoke ocr -- --include-ignored
```

Le test Rust optionnel attend un imprimé contenant « Pain » et « Crème fraîche » ; il reste ignoré sans fixture et modèles installés.
