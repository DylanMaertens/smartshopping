# Enregistrer les preuves de recette

Les commandes s’exécutent depuis la racine du dépôt. Les valeurs entre chevrons doivent provenir de la recette réelle. Ne pas enregistrer les exemples tels quels.

Les dates correspondent à l’événement observé, avec heure et fuseau ISO 8601 (par exemple `2026-09-15T14:30:00+02:00`). Elles ne peuvent pas être futures. Les références doivent être des URL HTTPS ou `github-actions://` sans identifiants intégrés. Le contrôle valide leur forme ; un réviseur doit vérifier leur accessibilité et leur contenu. Ne pas mettre de secrets dans ces références.

## Approbation humaine

Rôles : `privacy_legal`, `support_owner`, `data_retention_owner`.

```bash
python3 ops/record-beta-evidence.py approval privacy_legal \
  --approver '<personne ayant approuvé>' \
  --approved-at '<date réelle de décision>' \
  --evidence 'https://<référence de la décision>'
```

## Appareil physique

Une réussite exige les quatre scénarios explicitement déclarés. Le build doit identifier la version effectivement installée. Pour enregistrer un échec, utiliser `--status failed` et nommer les scénarios exécutés ; détailler les résultats dans la preuve liée.

```bash
python3 ops/record-beta-evidence.py device android \
  --tester '<personne ayant testé>' --build-id '<build installé>' \
  --tested-at '<date réelle du test>' --status passed \
  --scenario camera --scenario offline --scenario recovery --scenario restart \
  --evidence 'https://<rapport de test physique>'
```

Répéter pour `ios`. Les anciennes commandes sans date ou sans scénarios explicites sont désormais refusées.

## Réception SIEM

Vérifier dans le SIEM de recette la réception de l’événement agrégé et de l’alerte liée à un refus Transit. L’exécution du script d’export seule ne prouve pas que l’alerte a été reçue. L’outil ci-dessous enregistre l’observation ; il ne configure pas le SIEM. Le workflow Vault Transit génère désormais le refus de test dans son Vault temporaire, puis propose deux agrégats au SIEM configuré.

```bash
python3 ops/record-beta-evidence.py siem \
  --tester '<personne ayant vérifié>' --tested-at '<date réelle de vérification>' \
  --status passed --aggregate-received --transit-denial-alert-received \
  --evidence 'https://<rapport de réception et alerte>'
```

Un résultat incomplet peut être enregistré avec `--status failed`, en indiquant uniquement les réceptions constatées.

## Exercices de reprise

La CI écrit `exercised_at` dans le résultat à la fin des vérifications. Après revue, importer chaque résultat téléchargé individuellement dans l’historique courant :

```bash
python3 ops/record-recovery-result.py '<résultat téléchargé.json>' \
  --evidence 'https://github.com/<organisation>/<dépôt>/actions/runs/<identifiant>'
```

Pour un ancien résultat sans date, ajouter `--exercised-at '<date réelle de l’exercice>'`. La date d’import n’est jamais utilisée à sa place. Utiliser une référence stable et unique pour chaque exécution. Un deuxième import avec la même référence ou le même instant est refusé, sans écraser le fichier. Importer les résultats un par un évite de remplacer un historique récent par un ancien candidat téléchargé.

Les mesures doivent être des nombres finis positifs ou nuls. Un dépassement RTO/RPO est conservé avec le statut `failed` et la commande retourne 1. Trois exercices réussis distincts sont requis ; le plus récent doit respecter la fréquence de `ops/recovery-objectives.json`.

## Contrôle avant diffusion

```bash
python3 -B -m unittest discover -s ops/tests -v
python3 ops/check-beta-readiness.py --strict --output /tmp/smartshopping-beta-readiness.json
```

Sans `--strict`, les preuves en attente sont acceptées pour le développement, mais les fichiers malformés échouent toujours. Le rapport JSON contient `ready`, `errors` et `blockers`. La CI l’archive même lorsqu’une validation échoue. Les références sont des attestations à réviser, pas une vérification automatique du fait qu’une recette a réellement eu lieu.

## Chaîne d’audit et envoi SIEM

Le workflow `Vault Transit integration` compile le test Rust avant de créer son token de cinq minutes. Après les opérations de chiffrement, déchiffrement et rotation, il vérifie les paires requête/réponse grâce à `request.id`, conformément au [schéma d’audit Vault](https://developer.hashicorp.com/vault/docs/audit/schema).

Il appelle ensuite `transit/decrypt/smartshopping-denied-probe`, hors de la politique du token applicatif. La sonde doit retourner HTTP 403. Le contrôle `--expect-denial` exige une seule réponse contenant `permission denied` sur ce chemin ; toute autre erreur reste bloquante. Même attendu, ce refus produit un agrégat de statut `alert` pour vérifier l’alerte SIEM.

Configurer ensemble `SIEM_INGEST_URL` et `SIEM_INGEST_TOKEN` dans GitHub puis lancer le workflow. Leur absence commune laisse les tests et les agrégats disponibles sans envoi ; une configuration partielle fait échouer l’étape. Aucun envoi vers un SIEM réel n’est effectué par les tests unitaires.

L’export n’accepte que quatre champs : `schema`, `vault_audit_entries`, `vault_errors`, `status`. Les champs additionnels, compteurs incohérents et redirections HTTP, y compris HTTPS vers HTTPS, sont refusés. Le token est conservé dans un fichier temporaire privé puis supprimé. Les corps de réponse du serveur ne sont pas affichés.

L’artefact `vault-audit-aggregates` contient uniquement `vault-audit-summary.json` et, si la sonde a abouti, `vault-audit-alert.json`. Les journaux bruts ne sont plus archivés par ce workflow : leur détection de fuite est limitée aux secrets sentinelles des tests et ne constitue pas un expurgateur général. Les logs et tokens temporaires sont supprimés en fin de job.

Une réponse HTTP 2xx valide seulement l’acceptation de la requête par l’endpoint. Vérifier ensuite dans le SIEM la réception des deux événements et l’apparition de l’alerte avant de remplir `SIEM_VALIDATION.json`.
