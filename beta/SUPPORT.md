# Support de la bêta fermée

Les testeurs communiquent le modèle du téléphone, la version Android/iOS, l’heure UTC et le `X-Request-Id` affiché par
l’application. Ils ne doivent jamais transmettre un secret SecureStore, un token d’invitation actif ou un dump SQLite.

Priorités : **P0** fuite ou perte globale de données (réponse immédiate), **P1** synchronisation ou démarrage impossible
(un jour ouvré), **P2** défaut fonctionnel avec contournement (trois jours ouvrés). Le responsable applique
`ops/RUNBOOK.md`, conserve les preuves minimales, révoque les accès touchés et informe les testeurs concernés.

Avant chaque vague : vérifier les sauvegardes, le dernier exercice de restauration, les alertes, le dev-client signé et
les quatre scénarios Maestro. Après la bêta : purger les données serveur selon `DATA_RETENTION.md`.
