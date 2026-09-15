# Cahier des charges — Liste de courses intelligente

## Statut du document

Ce document est le **référentiel stable** des exigences produit et des décisions d’architecture. Il ne décrit ni l’avancement, ni les tests exécutés, ni les tâches à venir. Ces informations sont centralisées dans [`COMPTE_RENDU.html`](COMPTE_RENDU.html).

Une modification de ce cahier des charges est justifiée uniquement par une décision explicite affectant le périmètre, les exigences, la sécurité, la confidentialité ou l’architecture cible.

## 1. Objectif

Fournir une application mobile de liste de courses simple et performante qui fonctionne d’abord localement, sans compte obligatoire, et qui peut enrichir ou synchroniser les données lorsque le réseau et le backend sont disponibles.

L’application doit permettre :

- l’ajout rapide d’un produit en texte libre ;
- l’ajout par lecture d’un code-barres ;
- la préparation d’une future saisie OCR ;
- le classement automatique par rayon de magasin ;
- la gestion de plusieurs listes ;
- une utilisation complète hors ligne ;
- une synchronisation et un partage optionnels.

## 2. Public cible

- familles, couples, colocations et étudiants ;
- personnes recherchant une application sans inscription obligatoire ;
- utilisateurs accordant de l’importance à la rapidité, à la confidentialité et à la fiabilité hors ligne.

## 3. Principes structurants

### 3.1 Offline-first

SQLite sur l’appareil constitue la source de vérité du mobile. Toute opération courante doit rester possible sans réseau. Les changements à transmettre sont enregistrés dans un journal local durable puis synchronisés lorsque la connectivité revient.

### 3.2 Backend cache-first

Le mobile interroge le backend pour l’enrichissement réseau. Le backend consulte ses caches avant tout fournisseur externe :

1. cache mémoire ;
2. cache distribué optionnel ;
3. Open Food Facts en dernier recours.

Une donnée expirée peut être renvoyée explicitement comme obsolète si le fournisseur est indisponible et si cela améliore la continuité de service.

### 3.3 Compte facultatif

Le fonctionnement local ne dépend d’aucun compte. L’identification technique minimale repose sur un UUID v4 anonyme généré sur l’appareil et envoyé dans `X-Device-Id` pour les fonctions de synchronisation ou de partage.

Cet identifiant :

- ne contient aucune information personnelle ;
- n’est pas utilisé pour du profilage publicitaire ;
- peut être remplacé lors d’une réinitialisation volontaire de l’application.

### 3.4 Dégradation contrôlée

Une panne d’Open Food Facts, de Redis, de PostgreSQL ou du backend ne doit pas empêcher la consultation et la modification des listes locales.

## 4. Architecture cible

```text
Application Expo / React Native
  ├─ SQLite : listes, articles, tombstones, cache et journal de sync
  ├─ Caméra : lecture de codes-barres
  └─ HTTP/JSON optionnel
          │
          ▼
API Rust / Axum
  ├─ cache mémoire
  ├─ Redis optionnel
  ├─ PostgreSQL optionnel pour la synchronisation durable
  └─ proxy contrôlé vers Open Food Facts
```

### Mobile

- React Native avec Expo SDK ;
- TypeScript strict ;
- Expo Prebuild / dev-client dès qu’un module natif non disponible dans Expo Go est requis ;
- SQLite pour les données métier ;
- composants accessibles et compatibles avec les thèmes clair et sombre.

### Backend

- Rust, Axum et Tokio ;
- API HTTP JSON versionnée ;
- cache mémoire obligatoire, Redis optionnel ;
- PostgreSQL optionnel pour les fonctions partagées ;
- client HTTP sortant avec timeout, retries bornés et limitation temporelle.

## 5. Exigences fonctionnelles

### 5.1 Listes et articles

L’utilisateur doit pouvoir :

- créer, sélectionner, renommer et archiver une liste ;
- ajouter, modifier, cocher et supprimer un article ;
- ajuster une quantité ;
- conserver ses données après un redémarrage ;
- retrouver les articles regroupés dans un ordre de rayons cohérent.

Une suppression destinée à être synchronisée est représentée par un tombstone durable jusqu’à confirmation du serveur.

### 5.2 Catégorisation

La taxonomie visible doit utiliser des rayons génériques compréhensibles, notamment : fruits et légumes, boulangerie, crémerie, boucherie et poissonnerie, surgelés, épicerie salée, épicerie sucrée, boissons, hygiène, entretien, bébé, animaux, non alimentaire et à classer.

La catégorisation locale reste disponible hors ligne. Les données Open Food Facts peuvent améliorer le résultat sans devenir une dépendance bloquante.

### 5.3 Codes-barres

Le scan doit ajouter immédiatement un article provisoire à la liste. L’enrichissement du nom et de la catégorie s’effectue ensuite en arrière-plan depuis le cache local ou le backend. Un échec réseau conserve l’article provisoire.

### 5.4 Synchronisation

La synchronisation est optionnelle et doit :

- transmettre uniquement les changements nécessaires ;
- reprendre au retour de la connectivité sans appels concurrents ;
- appliquer une résolution Last-Write-Wins fondée sur `updated_at` ;
- conserver les suppressions via `deleted_at` ;
- exposer à l’utilisateur le nombre d’opérations en attente, la dernière réussite et les erreurs utiles ;
- isoler strictement les données de chaque liste.

### 5.5 Partage

Le partage futur doit rester facultatif et sans création de compte imposée. Les invitations doivent être difficiles à deviner, limitées dans le temps et révocables. L’accès à une liste partagée doit être vérifié côté backend pour chaque lecture et écriture.

## 6. Contrats API stables

Routes principales :

- `GET /health` : disponibilité du service ;
- `GET /metrics` : métriques d’exploitation ;
- `GET /api/v1/products/:barcode` : produit normalisé et provenance du cache ;
- `GET /api/v1/categories` : taxonomie des rayons ;
- `POST /api/v1/categories/classify` : classification d’un libellé ;
- `POST /api/v1/sync` : synchronisation optionnelle d’une liste.

Les erreurs JSON utilisent un code stable et un message exploitable. Les réponses incluent un identifiant de requête permettant de corréler le mobile et le backend.

## 7. Open Food Facts et cache

La limitation doit contrôler le débit dans le temps et non uniquement le nombre de requêtes simultanées. La concurrence et le débit sont deux protections distinctes.

Règles minimales :

- code-barres validé avant tout appel externe ;
- User-Agent explicite ;
- timeout court ;
- retries bornés avec backoff ;
- limitation temporelle configurable ;
- cache produit avec TTL ;
- indication de la source et du caractère obsolète dans la réponse normalisée.

## 8. Sécurité et confidentialité

- TLS obligatoire hors développement local ;
- aucune clé secrète embarquée dans l’application ;
- CORS restreint aux origines configurées ;
- taille des requêtes limitée ;
- validation de tous les identifiants et champs entrants ;
- requêtes SQL paramétrées ;
- endpoint de synchronisation désactivable ;
- permissions mobiles minimales, avec explication avant accès à la caméra ;
- aucune collecte personnelle nécessaire au fonctionnement local ;
- métriques sans contenu de liste, code-barres individuel ou identifiant personnel.

Un `device_id` seul ne constitue pas une authentification forte. Toute fonctionnalité de partage doit ajouter une preuve d’accès révocable et empêcher l’accès par simple connaissance d’un `list_id`.

## 9. Performance et résilience

Objectifs :

- démarrage mobile inférieur à deux secondes sur un appareil cible représentatif ;
- ajout local perçu comme instantané ;
- scan ajouté avant l’attente réseau ;
- hit cache backend servi sans appel externe ;
- timeouts réseau bornés ;
- consommation batterie limitée, sans synchronisation périodique agressive ;
- fonctionnement local préservé en cas d’indisponibilité de toute dépendance serveur.

## 10. Qualité et validation

La livraison doit être couverte par :

- tests unitaires de la catégorisation, de l’identité et des conflits ;
- tests des composants mobiles critiques ;
- tests du schéma et des migrations SQLite ;
- tests des routes et protections backend ;
- tests PostgreSQL sur une base jetable ;
- vérification du bundle Android ;
- parcours manuels sur appareil réel pour la caméra, le hors-ligne, les redémarrages et les permissions.

## 11. Décisions de cadrage

- backend Rust / Axum ;
- mobile React Native / Expo ;
- Expo Prebuild recommandé pour les besoins natifs avancés ;
- SQLite comme source de vérité mobile ;
- backend et synchronisation optionnels ;
- cache-first avant Open Food Facts ;
- identification anonyme minimale ;
- Last-Write-Wins et tombstones pour le MVP ;
- absence de compte obligatoire.

## 12. Gouvernance documentaire

- Ce document change uniquement après validation d’une nouvelle décision de cadrage.
- Le README change uniquement si les prérequis, les commandes ou la structure d’accès au dépôt changent.
- Toutes les informations d’avancement sont maintenues exclusivement dans [`COMPTE_RENDU.html`](COMPTE_RENDU.html).
