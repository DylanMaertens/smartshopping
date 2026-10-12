# Administration privée — première version

Supervision, journaux, modération et messages **réels**, servis par le backend à `/admin/` sur son origine HTTPS. La page locale `http://127.0.0.1:8057/admin/index.html` reste une **démonstration** : son formulaire prépare un lien vers le serveur choisi, sans demander ni mémoriser de secret. Les vraies données ne sont jamais copiées dans cette maquette.

## Périmètre et protections

- Un compte opérateur provisionné localement ; aucune inscription publique ni valeur par défaut. Mot de passe de 14 caractères minimum, haché avec Argon2id (19 Mio, 2 passages, parallélisme 1, sel aléatoire). Fichier privé, mode `600` sur Unix. Aucun secret administrateur dans l’APK ou les fichiers du site public.
- Session opaque aléatoire, seule son empreinte est indexée en mémoire serveur. Cookie `__Host-poduna_admin`, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, sans Domain. Aucun jeton de session dans localStorage/sessionStorage. CSRF en mémoire de l’onglet.
- Expiration absolue de 8 h, inactivité de 30 min, révocation à la déconnexion, au redémarrage ou au changement d’origine HTTPS. Une nouvelle connexion remplace la session du navigateur ; au plus 8 sessions, la plus ancienne est retirée si nécessaire. Pas de rafraîchissement automatique qui maintiendrait une session ouverte indéfiniment.
- POST : origine HTTPS configurée exacte, en-tête dédié, jeton CSRF pour toutes les décisions et la déconnexion. Les lectures exigent aussi une session et l’en-tête dédié. Pas de CORS sur l’API admin. CSP, anti-iframe, `no-store`, `nosniff`, `no-referrer` ; insertion des événements et messages par `textContent`, jamais interprétés en HTML.
- Limite globale de 10 tentatives de connexion par fenêtre de 5 min, indépendante d’en-têtes IP/appareil falsifiables. Elle protège ce compte unique, mais un attaquant peut temporairement empêcher son propriétaire de se connecter : limitation simple de préproduction, pas un dispositif anti-DDoS.
- **Relais HTTPS sur la même machine obligatoire** : le backend n’accepte l’API admin que depuis une connexion TCP loopback. Il ne fait pas confiance à `X-Forwarded-For`/`X-Forwarded-Proto`. Cloudflared vers `127.0.0.1` convient. Un proxy dans un autre conteneur ne fonctionnera pas sans une évolution explicite de cette politique ; ne pas supprimer le contrôle pour le contourner.
- L’API mobile garde ses signatures d’appareil ; la session admin ne donne pas accès aux listes. `/metrics` exige désormais un bearer configuré et retourne 404 sans secret. Prometheus conserve son secret dédié ; ne pas le réutiliser dans un navigateur.

Cette version est **mono-processus pour les sessions, mono-administrateur, sans MFA ni rôles multiples**. Avant une ouverture publique durable/VPS : MFA ou barrière d’accès supplémentaire, architecture du proxy, copie d’audit externe, supervision externe, sauvegardes et recette dédiée. Ce travail n’active pas le catalogue communautaire.

## Créer le compte puis activer sur le tunnel temporaire

1. Compiler les binaires, sans démarrer ni arrêter de service :

   ```bash
   cargo build --locked --manifest-path backend/Cargo.toml --bins
   ```

   `cargo` doit être sur le PATH. Si la machine utilise un cache `CARGO_TARGET_DIR` externe, conserver ce réglage et le binaire désigné par `.local-dev/server-tools.json`. Le lanceur HTTPS réutilise ce chemin : une compilation ailleurs ne le remplace pas automatiquement.

2. Choisir les identifiants **dans le terminal**, jamais dans le chat :

   ```bash
   python3 ops/setup-admin.py
   ```

   Le script détecte `backend/target/debug/admin-password-hash`, sinon son voisin dans le répertoire du backend configuré. Option `--hasher /chemin/admin-password-hash` disponible. Mot de passe saisi sans écho, transmis au hacheur par stdin, pas comme argument. Fichier créé : `.local-dev/admin/credentials.json`, ignoré par Git. Il n’écrase aucun compte existant.

3. Arrêter volontairement l’ancienne session serveur/tunnel, puis lancer :

   ```bash
   python3 ops/local-https.py --admin
   ```

   `--admin` refuse de réutiliser un backend déjà démarré : il ne peut pas lui ajouter une configuration en cours de route. Il ne l’arrête pas automatiquement. Si nécessaire, arrêter le lanceur courant avec `python3 ops/local-https.py stop` et attendre son arrêt ; un backend lancé séparément doit être arrêté depuis son propre terminal.

4. Ouvrir l’adresse affichée `https://…trycloudflare.com/admin/` et se connecter. L’origine est écrite atomiquement dans `.local-dev/https/admin-origin`, utilisée par le backend et vidée à l’arrêt. À chaque nouveau tunnel, utiliser le nouveau lien : l’ancienne session n’est pas transférée. Renseigner également la nouvelle adresse dans l’APK si elle a changé.

Le tunnel Cloudflare termine TLS, comme pour l’application. Le dernier trajet local se fait sur loopback. Le lanceur reste réservé au développement : PC allumé et processus en cours. L’admin n’exige pas de domaine définitif.

### Ouvrir aussi le contact pour les tests

Après création du compte et compilation, **au prochain démarrage volontaire** :

```bash
python3 ops/local-https.py --admin --contact
```

Cette option ouvre `https://…trycloudflare.com/contact.html`, sur la **même origine** que l’admin. Sans `--contact`, la réception reste fermée ; les messages déjà reçus restent consultables. `--contact` exige `--admin`, un compte configuré et PostgreSQL. En configuration manuelle, l’option correspond à `ENABLE_CONTACT_FORM=true`. Elle n’active pas `ENABLE_COMMUNITY_CATALOG`.

Le contact statique à `127.0.0.1:8057/contact.html` conserve son aperçu fictif et propose un champ pour préparer le lien du vrai formulaire. L’utilisateur ouvre lui-même ce lien, après vérification de l’hôte ; aucun texte ou e-mail saisi dans l’aperçu n’est transféré. Au changement de tunnel, fournir le nouveau lien. Aucune URL ni donnée personnelle n’est sauvegardée dans le navigateur.

## Modération et historique durable

- Recherche serveur dans toute la file et l’état sélectionnés, avant pagination : produit/code-barres/référence pour la modération, adresse/sujet/référence pour les messages. Sous-chaîne littérale insensible à la casse, accents conservés, 120 caractères maximum ; `%` et `_` ne sont pas des jokers. Aucun corps de message dans les résultats de recherche. Nombre total de résultats affiché, recherche effaçable et retour en première page après changement de filtre.
- Compteurs globaux : signalements en attente, propositions en attente de consensus, nouveaux messages et messages en cours. Indépendants des filtres, actualisés à la connexion, avec Actualiser et après une décision ; les raccourcis ouvrent la bonne file et le bon état. Base indisponible : tiret et avertissement, pas de faux zéro. Pas de sondage permanent qui prolongerait les sessions.
- Motif non enregistré : confirmation avant Fermer/Échap/déconnexion ; protection native avant rechargement/départ lorsque le navigateur le permet. Le texte reste présent en cas d’échec serveur et n’est stocké ni dans localStorage ni dans sessionStorage. Expiration/révocation : les données sont effacées pour verrouiller l’accès, sans bloquer la sécurité sur une confirmation. Les erreurs réseau sont en français et les erreurs serveur affichent une référence technique à retrouver dans les journaux.
- Onglet **Modération**, files Signalements et Propositions, filtres d’état, pages de 50 dossiers, détail du code-barres/champ/valeur et propositions actives concurrentes (20 maximum), accords actifs et votants distincts par champ. Aucun identifiant d’appareil exposé dans ces réponses.
- Proposition : rejet si elle est en attente, retrait si elle est validée. Pas d’approbation administrative qui contourne les votes. Signalement : écarter, confirmer **sans retirer**, ou confirmer et retirer la proposition liée. Le dialogue précise l’effet et demande une confirmation.
- Motif obligatoire de 10 à 1 000 caractères. La transaction PostgreSQL enregistre opérateur, date, action, état précédent et suivant dans `admin_decisions`. Le retrait depuis un signalement crée aussi l’historique de la proposition. Les 50 dernières décisions sont consultables dans chaque dossier.
- Verrou produit partagé avec les contributions/votes, contrôle de version et d’état, conflit HTTP 409 si le dossier a changé. L’échec de l’insertion d’audit annule la mutation ; deux décisions concurrentes sur le même état ne sont pas appliquées deux fois. Pas de repli en mémoire si PostgreSQL tombe.
- Recalcul du consensus selon les seuils existants, invalidation Moka et tentative Redis bornée à une seconde. Les lectures de produits revalident aussi les valeurs communautaires en cache contre la base. **Les copies déjà présentes sur les téléphones ne sont pas effacées à distance** ; les choix privés ne sont pas modifiés.
- Aucune sanction automatique, suspension de contributeur, modification forcée du produit ou ouverture du catalogue public. Ces fonctions demanderaient une politique et une interface supplémentaires.
- Audit durable mais **pas inviolable** : l’application n’offre ni modification ni effacement de l’historique, mais un propriétaire de la base peut le modifier. Prévoir sauvegardes/copie externe et droits PostgreSQL dédiés avant production. Ne pas copier de données sensibles dans les motifs.

## Réception des messages

- Formulaire HTTPS avec e-mail, quatre sujets, texte de 20 à 3 000 caractères, relecture et confirmation explicite. Référence affichée uniquement après enregistrement. Pas de pièce jointe, pas d’envoi ou d’accusé par e-mail.
- Onglet **Messages**, filtres **Nouveau / En cours / Clos**, pages de 50 dossiers, contenu privé et historique des changements motivés. Un dossier peut être rouvert. « Clos » ne signifie pas « Répondu ». Le corps du message n’est chargé que dans le détail.
- Référence UUID de soumission conservée en mémoire de l’onglet pour retenter à l’identique après une réponse perdue ; stockage transactionnel dédupliqué. Changer le contenu crée une nouvelle demande. Recharger l’onglet perd cette référence : vérifier la réception avant de renvoyer après un doute.
- Endpoint public exact `POST /api/v1/contact`, volontairement sans signature d’appareil ni compte utilisateur, mais limité au relais loopback et à l’origine HTTPS configurée, en-tête dédié, JSON strict ≤ 16 Kio, champ piège, aucun CORS. Aucun endpoint public de lecture des messages.
- Anti-abus de préproduction : 20 tentatives/minute par processus, quota partagé en base de 30 messages/heure au total et 3/heure par adresse normalisée. Contrôle atomique même en concurrence. Aucune IP ni adresse e-mail dans les journaux techniques. Ce n’est ni une vérification d’identité de l’expéditeur, ni un CAPTCHA, ni une protection DDoS ; les quotas globaux peuvent être épuisés par un tiers.
- **Réservé aux tests contrôlés** : adresses et corps conservés dans PostgreSQL, pas de chiffrement applicatif dédié ni de purge automatique. Fixer la durée de conservation, le mécanisme de suppression, les informations légales et la protection des sauvegardes avant ouverture publique. La page l’indique avant l’envoi. Ne pas y envoyer de données sensibles.
- Réponses e-mail, domaine et fournisseur SMTP/API, suivi de livraison, réception des réponses, attribution et notifications restent à développer ultérieurement.
- Le formulaire réel reprend la DA Origine du site : logo, navigation vers l’aide, cartes FAQ/formulaire alignées. Compteur de caractères, bouton de reconnexion si le service est inaccessible, erreur explicite conservant le contenu et protection native avant abandon du formulaire. L’aide est embarquée sur le même serveur ; aucun lien vers un faux accueil ni transfert à une origine tierce.

Migration additive `007_admin_workflows.sql`, appliquée par le backend au démarrage configuré avec PostgreSQL. Ne pas modifier les migrations déjà appliquées. Le développement et les tests n’appliquent rien à la base réelle ; sauvegarder celle-ci avant le premier redémarrage avec le nouveau binaire.

### Configuration manuelle

`ADMIN_CREDENTIALS_FILE` désigne le JSON privé avec `username` et `password_hash`. `ADMIN_ORIGIN=https://hote.example` définit une seule origine, sans chemin, identifiants, paramètres ou fragment. Pour le tunnel, `ADMIN_ORIGIN_FILE` remplace cette valeur et est relu à chaque requête. Un fichier absent/vide/invalide ferme l’accès ; une configuration de compte invalide interrompt le démarrage. Ne pas activer l’admin sur HTTP et ne pas rendre le cookie non sécurisé pour faciliter les tests.

Pour changer/récupérer le mot de passe, créer un **nouveau fichier** avec `setup-admin.py --output …`, pointer `ADMIN_CREDENTIALS_FILE` dessus puis redémarrer. Cela invalide toutes les sessions. Avec `--admin`, qui utilise le chemin fixe, remplacer volontairement le fichier local après en avoir conservé une copie privée si nécessaire. Aucune réinitialisation par e-mail.

## Mesures et journaux

- API : disponibilité de la requête courante. PostgreSQL : `SELECT 1` ; Redis : `PING`, délais plafonnés à 1 seconde chacun et vérifications concurrentes. État non configuré distinct d’indisponible.
- Requêtes applicatives, réponses 5xx, refus 4xx et durée moyenne depuis le démarrage du processus. Consultations admin, santé et métriques exclues de ces compteurs d’activité. Compteurs de cache/catalogues/synchronisation/quotas existants conservés.
- Catalogues, OCR et communauté : état d’activation ou absence de sonde explicite, **pas de faux voyant vert de disponibilité**. Aucun appel automatique payant ou photo de test. CPU/RAM/disque, état des sauvegardes et alertes hors machine restent à ajouter.
- Journal : date UTC, référence de requête UUID, route normalisée, méthode issue d’une liste bornée, service, statut HTTP, durée, code d’événement interne. Les 401/403/429 sont capturés avant leur retour. Les succès/échecs de connexion et déconnexions sont inclus ; les lectures admin réussies n’encombrent pas le journal.
- Pas de corps de requête/réponse, noms de produits, listes, photos, mots de passe, cookies, signatures, codes d’invitation, paramètres d’URL, IP ni chaîne de connexion dans ce flux. La trace HTTP automatique contenant l’URI brute a été retirée.
- **1 000 événements au maximum, 24 h au plus, en mémoire** : les plus anciens sont retirés. Le redémarrage les perd. Ce flux structuré ne lit pas les fichiers stdout/stderr existants ; ce n’est pas une collecte exhaustive ni un audit persistant. L’interface filtre par niveau, service ou recherche ; aucune suppression/export public.
- Les données affichées sont actualisées manuellement et marquées périmées en cas de panne. À l’expiration ou la déconnexion, elles sont effacées de la page ; un autre onglet se verrouille à sa prochaine requête.

## Vérifications

Validation du 9 octobre 2026 : **58 tests Rust** réussis (50 habituels + 8 intégrations PostgreSQL), **3 tests Python**, parcours HTTPS réels et maquette statique à quatre largeurs avec texte à 200 %. Les quatre intégrations optionnelles Redis/Vault/catalogues/OCR réels n’ont pas été exécutées.

Les essais utilisent uniquement des backends, comptes et bases éphémères ; aucun compte réel créé ni tunnel actuel redémarré. Les intégrations PostgreSQL ci-dessous créent une base vide et la détruisent à la fin, sans utiliser `DATABASE_URL` du serveur habituel.

```bash
cargo test --locked --manifest-path backend/Cargo.toml
python3 -m unittest discover -s ops -p test_admin_setup.py
# Chromium et Playwright installés, binaires compilés :
node web/scripts/check-live-admin.mjs
# PostgreSQL local (initdb, pg_ctl, createdb, psql), puis parcours HTTPS réels :
python3 ops/test-backend-postgres.py --browser
```

Le test navigateur lance un backend **isolé**, une paire de clés TLS éphémère et un proxy HTTPS loopback, avec un compte fictif. Aucun tunnel, base ou secret réel réutilisé. Chemins configurables par `PODUNA_TEST_BACKEND`, `PODUNA_TEST_HASHER`, `SMARTSHOPPING_PLAYWRIGHT_MODULE` et `PLAYWRIGHT_BROWSERS_PATH`. Il vérifie connexion, cookies, persistance après rechargement, déconnexion et révocation multi-onglets, vrais compteurs/journaux, échappement HTML, filtres, absence de stockage JS, largeurs 320/390/768/1440 et texte à 200 %.

`PODUNA_TEST_PG_BIN` peut désigner le dossier des outils PostgreSQL. Le runner exécute la modération/contact, le consensus communautaire et les cinq intégrations de synchronisation PostgreSQL, puis, avec `--browser`, une seconde base vide pour les essais navigateur : réception, retry sans doublon après coupure, lecture privée, changements d’état, audit, retrait après signalement, texte hostile neutralisé, quatre largeurs et texte à 200 %. Captures dans `web/.qa/live-workflows/` (ignorées par Git).

Les tests Rust couvrent accès désactivé, session absente/falsifiée/révoquée/expirée, renouvellement, CSRF, origines/Host et en-têtes de proxy falsifiés, limites de connexion, rétention des logs, bornes mémoire, absence des données privées dans le journal, décisions concurrentes, rollback si audit impossible, invalidation du cache et persistance après nouvelle instance. Les intégrations Redis/Vault et les catalogues/OCR réels restent des suites optionnelles séparées.

Références : [sessions OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [journalisation OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).
