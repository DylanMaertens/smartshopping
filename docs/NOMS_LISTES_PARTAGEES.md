# Noms des listes partagées

Le nom d’une liste est commun à ses membres. Le propriétaire et les membres peuvent la renommer depuis les menus existants. Le formulaire précise que le changement sera transmis aux autres membres.

## Partager et rejoindre

Depuis **Mes listes → ⋯ → Partager**, l’invitation concerne directement la liste choisie, sans devoir l’ouvrir. Le bouton **Partager** reste accessible dans la liste ouverte. Ce panneau contient le code à transmettre, le QR et la gestion des membres.

**Rejoindre une liste** contient uniquement la saisie du code reçu et le scanner d’invitation. Les liens reçus ouvrent aussi ce panneau, sans partager la liste actuellement sélectionnée.

## Comportement

- Créer une liste vide suffit à mettre son nom en attente de synchronisation.
- Un renommage est enregistré immédiatement sur l’appareil et envoyé après une seconde sans nouvelle modification. Il reste en attente hors ligne, y compris après fermeture de l’app.
- Rejoindre une liste déclenche la récupération de son nom. « Liste partagée » reste un libellé provisoire si le serveur est indisponible ou si l’ancien propriétaire n’a pas encore transmis son nom.
- La liste ouverte est actualisée au premier plan selon le cycle de 15 secondes existant. Sur l’accueil, les listes sont parcourues par groupes de trois au maximum par cycle. Une liste dont l’accès a été révoqué ne bloque pas l’actualisation des suivantes.
- L’actualisation s’arrête en arrière-plan. Les échecs espacent les cycles à 30, 60 puis 120 secondes, selon le mécanisme existant.
- Les articles et l’ordre personnel des rayons conservent leur comportement. Retirer une liste de cet appareil ne la supprime pas chez les autres membres.

## Ordre des articles

Les articles sont affichés par ordre alphabétique dans chaque rayon ainsi que dans « Déjà pris ». Le tri utilise les noms normalisés puis les identifiants partagés pour départager les noms identiques. Il ne dépend pas des dates locales ni de l’ordre de réception des données. Changer une quantité ne déplace pas un article ; le renommer ajuste sa position alphabétique.

Ce tri s’applique aussi aux listes existantes après rechargement de l’app, sans migration serveur ni modification à envoyer. L’ordre des rayons reste une préférence personnelle de chaque appareil.

## Conflits et compatibilité

Le nom possède sa propre date de modification, indépendante de celle des articles. En cas de renommages concurrents, la date la plus récente l’emporte ; à dates égales, l’ordre lexical UTF-8 des noms départage les versions, indépendamment de l’ordre d’arrivée. Cette règle dépend des horloges des appareils, comme la synchronisation actuelle des articles.

Une réponse en retard ne remplace pas un renommage effectué depuis le départ de la requête. Le téléphone confirme uniquement la version effectivement envoyée, dans la même transaction SQLite que les articles reçus.

Les noms locaux existants sont proposés avec la version zéro. Seul le propriétaire peut initialiser un nom encore absent du serveur ; cette proposition ne remplace jamais un nom déjà partagé. Un membre peut ensuite effectuer un renommage explicite.

Le serveur applique les noms et les articles dans une même transaction PostgreSQL, sous le verrou de liste existant. Un appareil non membre ou révoqué ne peut ni lire ni modifier le nom. Les noms sont limités à 200 caractères Unicode.

La migration `005_list_names.sql` est appliquée par le backend au démarrage. **Mettre à jour et redémarrer le backend, puis recharger l’app sur les appareils.** Avec un ancien backend, les articles continuent à se synchroniser et les renommages restent en attente, sans être déclarés envoyés. Un ancien client ne supprime pas le nom partagé.

## Essai sur deux téléphones

1. Créer une liste « Courses famille » sur A et partager son invitation avec B.
2. Rejoindre depuis B : vérifier le nom, même si la liste ne contient aucun article.
3. Sur B, renommer en « Courses du week-end ». Laisser A sur la liste ou sur l’accueil : le nom doit se mettre à jour au prochain cycle.
4. Passer B en mode avion, renommer, fermer puis rouvrir l’app. Le nom local doit rester présent ; rétablir le réseau et vérifier sa réception sur A.
5. Effectuer deux renommages rapprochés pendant un envoi : le second doit rester en attente puis être transmis.

Les tests automatisés couvrent SQLite, les écrans, l’API en mémoire et une base PostgreSQL temporaire. Ils ne remplacent pas cet essai sur les téléphones.

## Ajouts simultanés et retrait d’accès — 4 octobre 2026

Deux appareils ajoutant le même nom avant synchronisation affichent ensuite une seule ligne, dont la quantité additionne leurs ajouts. Casse et espaces sont normalisés. Les contributions conservent leurs identifiants distincts dans SQLite et sur le serveur ; seule la vue les regroupe. Ainsi, recevoir plusieurs fois les mêmes données ne recompte pas les quantités. Le regroupement s’applique aussi aux doublons existants après rechargement des deux clients.

Les actions renommer, choisir un rayon, cocher et supprimer concernent toutes les contributions connues de la ligne. Les boutons de quantité modifient le total une seule fois ; diminuer peut retirer une contribution avec un tombstone. L’OCR, la saisie et le scan vérifient le total avant de l’augmenter. Si plusieurs ajouts hors ligne dépassent ensemble 999, le total réel reste visible et peut être diminué : aucune quantité n’est tronquée. Les sauvegardes conservent les contributions ; la restauration les regroupe à nouveau.

Cela ne change pas la règle de conflit existante lorsqu’on modifie simultanément **le même identifiant** : la version datée la plus récente l’emporte. Un ajout inconnu au moment d’une suppression peut encore arriver ensuite. Aucun regroupement n’est effectué entre des listes différentes.

Lorsqu’une synchronisation reçoit un refus d’accès HTTP 403, le client mémorise **Synchronisation coupée**. La copie locale et les modifications restent disponibles, y compris après redémarrage. Les envois et actualisations de cette liste s’arrêtent ; Partager est désactivé dans la liste et dans Mes listes. Les autres listes continuent à s’actualiser. Une erreur réseau, HTTP 401 ou 500 conserve le mécanisme de réessai normal.

Rejoindre à nouveau cette liste avec une invitation valide rétablit la synchronisation et remet les changements locaux en attente d’envoi. Une sauvegarde restaurée est une nouvelle copie indépendante et n’hérite pas de l’état déconnecté.

**Révoquer un code** empêche seulement les nouvelles arrivées. Les membres déjà présents restent autorisés. Pour couper la synchronisation d’un appareil, le propriétaire utilise **Gérer les membres → Retirer**. Le retrait sera détecté par cet appareil à sa prochaine tentative de synchronisation ; il n’efface pas sa copie locale.

À vérifier sur les téléphones : ajouter « Pain » sur A et B hors ligne, rétablir le réseau, constater une ligne de quantité 2 sur chacun et attendre plusieurs cycles ; retirer B, vérifier le statut neutre et le partage désactivé, puis rejoindre avec une nouvelle invitation. Les tests automatisés couvrent ces mécanismes avec deux bases SQLite et les composants, sans constituer une validation sur appareils physiques.
