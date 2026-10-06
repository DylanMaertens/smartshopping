# Runbook d’exploitation SmartShopping

## Sauvegarde et restauration

1. Exécuter quotidiennement `backup-postgres.sh` avec un compte PostgreSQL en lecture.
2. Chiffrer et transférer ensemble le dump et son fichier `.sha256` vers un stockage immuable hors site. Chaque sauvegarde est créée dans un sous-dossier privé unique ; le script affiche son chemin absolu uniquement après réussite.
3. Tester selon `ops/recovery-objectives.json` la commande `CONFIRM_RESTORE=RESTORE restore-postgres.sh <dump>` sur une base isolée. Python 3 et un client PostgreSQL compatible avec le serveur sont nécessaires. Le checksum est vérifié sur le dump sélectionné, même après déplacement du dossier ; les anciens manifestes à chemin absolu restent acceptés.
4. Vérifier les migrations, le nombre de listes, les membres et un cycle de synchronisation signé.
5. Exécuter `purge-expired-data.sh` après restauration afin de réappliquer la politique de rétention. Sur une copie de test uniquement, `verify-retention-purge.sh` injecte puis purge un appareil expiré avec secret et un tombstone.

## Rotation de la clé d’enveloppe

1. Générer une nouvelle clé avec `rotate-device-encryption-key.sh` dans le gestionnaire de secrets.
2. Déployer la nouvelle valeur comme `DEVICE_SECRET_KEY` et l’ancienne comme `DEVICE_SECRET_PREVIOUS_KEY`.
3. Les lectures déchiffrent l’ancienne version et la ré-encryptent avec la clé courante.
4. Contrôler les erreurs de déchiffrement, puis retirer l’ancienne clé après le délai de rétention.

En production, configurer `VAULT_ADDR`, `VAULT_TOKEN_FILE` et `VAULT_TRANSIT_KEY`. Le token doit être limité par
`vault-transit-policy.hcl`. Vault journalise les appels Transit ; le backend journalise uniquement le fournisseur et
l’opération, jamais le secret ou le ciphertext. La clé locale reste un mode de secours pour développement/migration.

## Perte d’un secret mobile

Un secret SecureStore perdu n’est jamais redélivré. Révoquer l’ancien appareil depuis un membre autorisé,
faire tourner l’identité locale, ré-enrôler le nouvel appareil et le réinviter aux listes. Cette procédure
privilégie l’absence de prise de contrôle à une récupération anonyme non authentifiée.

## Panne Redis

Les signatures échouent de manière fermée si l’anti-rejeu distribué est indisponible. Le quota conserve un
repli local borné. Restaurer Redis, vérifier la latence et les erreurs, puis rejouer une requête avec un nonce neuf.

## Panne PostgreSQL

L’enrôlement, la rotation, le partage et la synchronisation persistante doivent échouer sans basculer vers le
registre local. Restaurer la base ou promouvoir le réplica, appliquer les migrations et vérifier `/health` avant reprise.

## Incident de sécurité

1. Révoquer les accès concernés et préserver journaux, métriques et identifiants de requête.
2. Faire tourner les clés d’enveloppe et secrets d’infrastructure selon le périmètre.
3. Restaurer depuis une sauvegarde vérifiée si l’intégrité est compromise.
4. Documenter chronologie, impact, correction et actions préventives.

## Contrôles de sauvegarde et restauration

Une restauration utilise une transaction unique avec arrêt sur erreur : une erreur SQL annule aussi les suppressions de tables déjà effectuées. Ce comportement suit la [documentation PostgreSQL 17 de pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html). Pour les bases volumineuses, dimensionner les ressources et les verrous avant de choisir cette stratégie.

Le SHA-256 détecte une corruption du fichier ; il n’authentifie pas une sauvegarde provenant d’une source inconnue. Restaurer uniquement les sauvegardes du stockage de confiance prévu ci-dessus. Ne pas modifier le fichier pendant sa vérification/restauration.

Les tests rapides utilisent des commandes PostgreSQL simulées :

```bash
python3 -B -m unittest discover -s ops/tests -p test_postgres_backup.py -v
```

Pour vérifier les données et le retour arrière SQL, fournir **deux bases PostgreSQL jetables distinctes et vides**, puis lancer :

```bash
RUN_POSTGRES_BACKUP_TESTS=1 \
TEST_BACKUP_SOURCE_URL='postgresql://localhost/backup_regression_source' \
TEST_BACKUP_TARGET_URL='postgresql://localhost/backup_regression_target' \
python3 -B -m unittest discover -s ops/tests -p test_postgres_restore_integration.py -v
```

Ces tests écrivent dans la source et restaurent dans la cible : ne jamais utiliser de base métier. Les identifiants peuvent être fournis via `.pgpass` ou l’environnement du client. Le workflow `PostgreSQL backup and recovery` crée ces deux bases temporaires et utilise des clients PostgreSQL 17, comme le serveur. L’exercice hebdomadaire installe également ce client via le [dépôt officiel PostgreSQL pour Ubuntu](https://www.postgresql.org/download/linux/ubuntu/).

Ces tests de non-régression ne remplacent pas les trois exercices de reprise avec mesures RTO/RPO et justificatifs révisés.
