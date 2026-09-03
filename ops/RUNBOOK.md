# Runbook d’exploitation SmartShopping

## Sauvegarde et restauration

1. Exécuter quotidiennement `backup-postgres.sh` avec un compte PostgreSQL en lecture.
2. Chiffrer et transférer le dump et son SHA-256 vers un stockage immuable hors site.
3. Tester mensuellement `CONFIRM_RESTORE=RESTORE restore-postgres.sh <dump>` sur une base isolée.
4. Vérifier les migrations, le nombre de listes, les membres et un cycle de synchronisation signé.
5. Exécuter `purge-expired-data.sh` après restauration afin de réappliquer la politique de rétention.

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
