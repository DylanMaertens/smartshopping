# Rétention des données de bêta

| Donnée | Durée maximale | Suppression |
|---|---:|---|
| Listes locales | Jusqu’à suppression de l’application ou de la liste | Action locale du testeur |
| Listes synchronisées et membres | Durée de la bêta + 30 jours | Suppression sur demande ou purge de fin de bêta |
| Invitations | 24 heures | Expiration ou révocation immédiate |
| Nonces anti-rejeu Redis | 10 minutes | Expiration automatique |
| Métriques agrégées | 30 jours | Politique Prometheus |
| Sauvegardes chiffrées | 30 jours | Rotation automatique et suppression vérifiée |

Les secrets d’appareil révoqués doivent être supprimés avec le profil. Les restaurations ne doivent pas prolonger les
durées : toute restauration est suivie d’une nouvelle exécution de `ops/purge-expired-data.sh`. Le script supprime les
invitations expirées/révoquées et les appareils inactifs qui ne possèdent ni liste ni adhésion active.
