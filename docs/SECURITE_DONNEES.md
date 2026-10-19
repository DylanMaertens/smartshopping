# Protection des données et 2FA — état du 15 octobre 2026

Suite du 16 octobre : [durcissement, audits de dépendances, surveillance et blocages](SECURITE_EXPLOITATION.md).

Ces changements sont dans le code et testés sur des données isolées. **Ils ne changent pas le compte, les clés ni la base du serveur actuellement lancé.** Aucun nouveau VPS, compte, clé privée de sauvegarde ou APK n’a été créé. Les réglages d’exploitation ci-dessous doivent être activés volontairement.

## Admin : activer sans perdre l’ancien compte

Le 2FA utilise TOTP SHA-1, 6 chiffres, période 30 secondes, dérive acceptée ±30 secondes. Le mot de passe et le code sont requis ensemble ; aucun cookie n’est émis si un facteur manque. Un code accepté est consommé durablement avant la création de session. Le fichier compteur est verrouillé pendant toute la vie du backend. Une écriture impossible bloque les connexions, sans repli sur une authentification par mot de passe seul. Les secrets/codes ne sont pas journalisés.

Depuis un terminal **privé**, à la racine du projet :

```bash
cargo build --locked --manifest-path backend/Cargo.toml --bins
python3 ops/setup-admin.py --hasher backend/target/debug/admin-password-hash --output .local-dev/admin/credentials-2fa.json
```

Le second script demande le mot de passe, affiche la clé à saisir dans une application d’authentification compatible TOTP, puis exige un code correct. La clé et l’URI sont confidentielles : ne pas les transmettre dans le chat, une capture ou un ticket. Le script refuse d’écraser un fichier existant. Si le nom proposé existe déjà, choisir un autre nom.

Au prochain **arrêt/redémarrage volontaire**, après sauvegarde de la base, lancer avec les nouveaux fichiers et le nouveau binaire :

```bash
env PODUNA_ADMIN_CREDENTIALS_FILE="$PWD/.local-dev/admin/credentials-2fa.json" PODUNA_BACKEND_BIN="$PWD/backend/target/debug/shopping-list-backend" python3 ops/local-https.py --admin --contact
```

Cette syntaxe `env` fonctionne aussi dans fish. Le lanceur refuse un backend déjà lancé ; il ne l’arrête pas automatiquement. Ne pas simplement remplacer le binaire d’une session en cours. L’ancien compte sans TOTP est refusé par le nouveau backend ; préparer l’appairage avant de basculer. Vérifier l’heure automatique du serveur et du téléphone. Attendre le code suivant après l’appairage ou une connexion réussie.

Téléphone perdu : accès local/SSH privé au serveur, création d’une **nouvelle** paire de fichiers et d’une nouvelle clé TOTP, puis redémarrage contrôlé. Les anciennes sessions sont révoquées. Aucun contournement par e-mail ni désactivation du second facteur dans le navigateur. Conserver l’accès SSH/console de récupération hors du téléphone concerné. Le fichier `.totp-state` est sensible : ne pas le supprimer ni restaurer un ancien compteur. En cas de corruption/perte, reprovisionner la clé, pas le compteur.

Limites : clé TOTP stockée en clair dans un fichier privé (pas en base), comme nécessaire à sa vérification. Cela protège contre une fuite PostgreSQL seule, **pas contre une compromission du compte système/root**. TOTP n’est pas résistant au phishing. L’administration en conteneur garde son exigence de relais TCP loopback dans le même espace réseau ; une publication Docker vers l’hôte ne satisfait pas automatiquement ce contrôle. Ne pas l’enlever pour faciliter le déploiement.

## PostgreSQL et Redis

- Le lanceur local utilise PostgreSQL par socket Unix sans écoute TCP ; le répertoire de socket est désormais privé (700), les nouveaux démarrages utilisent des sockets 0700. Les nouveaux clusters utilisent `peer` localement, SCRAM côté hôte. Le fichier d’authentification d’un cluster existant n’est pas réécrit automatiquement.
- Dans Compose, PostgreSQL/Redis n’ont pas de port publié et partagent un réseau interne réservé à l’API et à la maintenance. Les ports API/Prometheus/Grafana sont publiés sur **127.0.0.1 uniquement**. Redis reste un cache sans persistance dans cette configuration ; il ne possède pas encore d’ACL par utilisateur. Un réseau interne n’est pas un chiffrement et ne protège pas d’un conteneur API compromis.
- PostgreSQL initialise ses nouveaux clusters avec SCRAM. Pour un volume existant, revoir `pg_hba.conf` et effectuer une rotation des mots de passe ; les variables d’initialisation n’en changent pas rétroactivement la politique.
- L’API Compose utilise `poduna_app`, sans droits d’administration ni propriété des tables. Elle peut lire/ajouter l’audit, mais pas le modifier, le supprimer ou le tronquer. Le backend vérifie ces limites au démarrage et refuse une configuration privilégiée.
- Les migrations sont exécutées par un processus distinct `migrate-db`. Son secret n’est pas monté dans le service API. L’API vérifie les versions/checksums attendus sans lancer de DDL.

### Activation sur le futur serveur

Ne pas appliquer aveuglément ces commandes à une base existante : sauvegarder et tester la restauration avant toute modification de droits.

1. Préparer `observability/secrets/database_migration_url` (compte propriétaire de la base) et les autres secrets privés ; utiliser les fichiers `.example` comme documentation, jamais leurs valeurs factices. Les mots de passe dans les URI doivent être encodés correctement. Les secrets ne doivent pas être suivis par Git.
2. Lancer PostgreSQL, puis la tâche de maintenance : `docker compose -f observability/docker-compose.yml --profile maintenance run --rm migrate`.
3. Connecté à **la base Poduna ciblée** via `psql` comme propriétaire, exécuter `\i ops/postgres-runtime-role.sql` depuis la racine du dépôt. Le script accorde une liste explicite de tables ; il ne crée pas de mot de passe. Définir celui-ci avec `\password poduna_app` dans le terminal privé.
4. Renseigner `observability/secrets/database_url` avec **poduna_app**, puis démarrer l’API. Elle attend `RUN_DATABASE_MIGRATIONS=false` et `REQUIRE_RESTRICTED_DATABASE_ROLE=true` (déjà définis dans Compose).
5. À chaque évolution du schéma : migrations séparées, revue des nouveaux droits puis démarrage de l’API. Ne jamais résoudre un refus en redonnant les droits superutilisateur à l’API.

Le rôle de migration reste propriétaire et doit être protégé davantage. Les droits sont une réduction des dégâts possibles, pas une protection complète contre une API compromise : elle peut encore lire les données auxquelles son fonctionnement exige l’accès. Prévoir TLS vérifié si PostgreSQL sort de ce réseau privé, chiffrement du disque VPS et copie externe des audits.

## Sauvegardes serveur chiffrées

`ops/backup-postgres.sh` accepte `BACKUP_RECIPIENT_FILE`, un fichier contenant **uniquement la clé publique OpenPGP de chiffrement** de l’opérateur. GnuPG doit être installé. Vérifier personnellement son empreinte avant installation sur le serveur ; ne pas accepter une clé reçue d’une source non vérifiée. Conserver la clé privée et son moyen de récupération hors du serveur et hors du dossier de sauvegarde.

```bash
env BACKUP_RECIPIENT_FILE=/chemin/prive/cle-publique.asc bash ops/backup-postgres.sh /chemin/prive/sauvegardes
```

`DATABASE_URL` doit être déjà défini dans l’environnement privé. Le mot de passe n’est plus passé dans les arguments de `pg_dump`/`pg_restore` ; un petit lanceur valide l’URI et utilise les variables libpq. Les paramètres URI non pris en charge sont refusés, sans connexion silencieuse à une autre base. Les variables d’environnement restent accessibles au même compte système/root : ce n’est pas un coffre à secrets.

Le dump va directement dans GnuPG, sans copie SQL en clair sur disque. Une erreur de dump ou de chiffrement supprime uniquement le nouveau lot incomplet. Fichier et somme SHA-256 sont publiés dans un dossier privé unique. **Sans `BACKUP_RECIPIENT_FILE`, la sauvegarde reste en clair** pour compatibilité ; l’activation nécessite donc cette clé publique. Une somme SHA-256 seule ne prouve pas l’authenticité contre un attaquant pouvant modifier aussi son manifeste.

Restauration explicite : `env CONFIRM_RESTORE=RESTORE sh ops/restore-postgres.sh /chemin/smartshopping.dump.gpg`, avec `DATABASE_URL` ciblant la base à restaurer et la clé privée disponible dans le trousseau GnuPG de l’opérateur. Cette opération **remplace les objets restaurés** : vérifier la cible et sauvegarder son état avant de confirmer. Vérification du checksum puis déchiffrement dans un dossier temporaire privé, restauration transactionnelle, suppression de la copie temporaire à la sortie normale/erreur. Une interruption forcée de la machine peut laisser ce temporaire : utiliser un disque/tmp chiffré et une politique de nettoyage adaptée.

Une sauvegarde chiffrée sans clé privée récupérable est perdue. Tester régulièrement une restauration sur une base isolée et conserver une copie hors machine. Les fichiers d’administration/2FA, clés d’appareils et paramètres d’exploitation ne sont pas dans le dump PostgreSQL : prévoir leur conservation séparée protégée ; après restauration ancienne du compte admin, reprovisionner le 2FA pour ne pas réintroduire un ancien compteur.

La restauration de production se fait API arrêtée. Le dump exclut les propriétaires et ACL : après restauration par le compte de maintenance, réappliquer les droits de `postgres-runtime-role.sql` et vérifier le démarrage restreint avant de rouvrir l’API.

## Sur le téléphone

Les données restent dans le stockage privé de l’app. La sauvegarde locale JSON étendue reste **non chiffrée** et l’interface l’indique. Aucun chiffrement SQLCipher, aucune nouvelle sauvegarde cloud et aucun 2FA utilisateur n’ont été ajoutés. Le 2FA concerne uniquement l’administration du serveur. Voir [sauvegarde locale](SAUVEGARDE.md).

## Vérifications réalisées

- Validation TypeScript, suites Vitest/Jest et configuration mobile ; restauration v1/v2, préférences sans produit dans une liste, conflits, thème immédiat, annulation, erreur d’écriture avec retour arrière complet et redémarrage SQLite.
- Vecteurs RFC TOTP, limites temporelles, code absent/incorrect, refus du mot de passe seul, concurrence, anti-rejeu après redémarrage et fichier verrouillé/corrompu ; suites Rust existantes.
- PostgreSQL éphémère : partage, communauté, modération/contact, droits du rôle limité, interdiction du DDL et de la suppression/modification de l’audit, quatre tests de restauration réelle.
- GnuPG réel avec clé éphémère : chiffrement/déchiffrement du contenu de test, échec amont de `pg_dump`, fichier corrompu, nettoyage du temporaire ; aucune clé personnelle utilisée.
- Chromium et backend HTTPS isolés : connexion 2FA, sessions, contact/modération/audit aux largeurs 320/390/768/1440, texte à 200 %. Tests d’ajout/rayons dans l’aperçu mobile à 320/390.
- Compose : syntaxe YAML et assertions d’isolation réseau vérifiées. **Docker/VPS non déployé**, clé de sauvegarde réelle non installée, appairage du téléphone non effectué et sélecteurs de sauvegarde natifs à confirmer dans un futur APK.

## Références

Choix de second facteur et récupération : [OWASP MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html). Codes et anti-rejeu : [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238). Authentification PostgreSQL : [SCRAM et migration des mots de passe](https://www.postgresql.org/docs/17/auth-password.html).
