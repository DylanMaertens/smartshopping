# Sauvegarder et retrouver ses listes

## Enregistrer sur l’appareil

1. Ouvrir **Réglages → Sauvegarde et restauration**.
2. Toucher **Enregistrer sur l’appareil**.
3. Choisir un dossier du téléphone dans le sélecteur système, puis autoriser son utilisation si Android le demande. Si un dossier est interdit par le système, choisir un sous-dossier accessible.
4. Attendre le message **Sauvegarde enregistrée dans le dossier choisi**, avec le nom du fichier. Il apparaît uniquement après écriture et relecture du contenu.

Le fichier est enregistré dans le dossier choisi, hors du cache temporaire de l’app. Annuler le choix du dossier ne crée pas de fichier. Une erreur d’accès, un manque de place ou un contenu incomplet ne sont pas signalés comme un succès.

## Partager le fichier

1. Ouvrir **Réglages → Sauvegarde et restauration**.
2. Toucher **Partager le fichier**.
3. Utiliser le menu du téléphone pour enregistrer le fichier JSON ou le transférer vers un emplacement choisi.
4. Vérifier que le fichier y est bien présent. Fermer ou annuler le menu de partage ne garantit pas son enregistrement.

La sauvegarde contient les listes présentes sur cet appareil, leurs noms, les articles non supprimés, quantités, cases cochées, codes-barres, rayons et leur ordre. Les changements locaux non encore synchronisés sont inclus. Elle ne récupère pas les changements distants que cet appareil n’a pas encore reçus.

Le format **version 2** ajoute le thème, les noms/rayons personnalisés par code-barres et les rayons mémorisés par nom, même pour un produit absent des listes. Les anciens choix enregistrés avant cette évolution restent lisibles et exportables.

Le réglage d’affichage des aides est également inclus. Les noms privés des membres
restent sur l’appareil, mais ne sont pas exportés : ils sont liés aux identités du
partage, que la restauration ne rétablit pas. Le switch de simulation premium et
les brouillons de contact sont exclus aussi.

Depuis le 12 novembre, chaque liste sauvegardée conserve aussi sa présentation
Bloc-notes et l’affichage des titres des rayons. Les anciennes sauvegardes sans
ces options restent lisibles (vue classique, rayons visibles). L’option d’aperçu
des contributions OCR n’est pas exportée et n’accorde aucun consentement d’envoi.
Importer ces nouvelles sauvegardes nécessite une version de l’app qui comprend
le champ de présentation ; garder l’ancienne app à jour sur l’appareil destinataire.

Le fichier n’est pas chiffré. Il ne contient ni identité d’appareil, ni secret de connexion, ni invitation, ni adresse de serveur, ni licence d’achat. Les listes retirées de l’appareil, articles supprimés et caches temporaires de catalogues sont exclus. Garder le fichier dans un emplacement privé.

## Restaurer

1. Sur le téléphone destinataire, ouvrir le même écran et toucher **Choisir une sauvegarde**.
2. Choisir le fichier JSON ; vérifier le nombre de listes et d’articles ainsi que la date.
3. Toucher **Restaurer les listes**, ou annuler sans modifier les données.

Les listes sont ajoutées comme **copies indépendantes et locales**, avec de nouveaux identifiants. Les listes déjà présentes, leurs modifications en attente et leurs droits de partage restent inchangés. La restauration fonctionne sans réseau ; aucune synchronisation ne démarre tant que la nouvelle liste n’est pas explicitement partagée.

Les préférences absentes sont ajoutées. En cas de conflit, **le choix actuel du téléphone gagne**, y compris un rayon volontairement remis à « À classer ». Sur un nouvel appareil sans thème enregistré, le thème sauvegardé est mémorisé ; s’il nécessite un droit premium absent, Origine s’affiche à sa place. La sauvegarde n’accorde aucun droit premium. Un thème déjà choisi est conservé. Les fichiers version 1 restent importables sans toucher aux préférences.

Pour retrouver une liste partagée avec les autres membres, la rejoindre par invitation. Restaurer son contenu ne rétablit pas l’appartenance ni les droits de propriétaire. Une copie restaurée peut ensuite être partagée séparément.

Un même fichier déjà restauré est refusé pour éviter les copies accidentelles. Deux sauvegardes différentes peuvent contenir les mêmes articles et créer des copies distinctes : aucune fusion automatique avec les listes actuelles n’est effectuée.

## Limites et protections

- Format SmartShopping version 2 en export, versions 1 et 2 en import ; au plus 4 Mo, 200 listes, 10 000 articles, 10 000 préférences par code-barres et 10 000 rayons par nom.
- Validation complète avant import : format, version, noms, quantités, types et codes-barres.
- Listes, préférences, thème et marqueur anti-double-import dans la même transaction SQLite : toute erreur annule l’ensemble, et le fichier peut être réessayé. Aucun secret n’est copié depuis le stockage général.
- Les rayons connus conservent leur ordre ; les nouveaux rayons de l’app sont ajoutés aux préférences importées.
- Le fichier exporté peut rester dans le cache privé pour laisser le destinataire du partage le lire. Cette copie temporaire ne remplace pas un fichier enregistré ailleurs.

## Vérification sur Android

Enregistrer sur l’appareil une liste contenant un article coché, un code-barres, une quantité supérieure à 1 et un ordre personnalisé des rayons. Vérifier le JSON dans le dossier choisi avec le gestionnaire de fichiers. Restaurer en mode avion : vérifier la copie et les listes existantes, puis reconnecter et relancer l’app. Essayer aussi Annuler, Partager le fichier et sélectionner deux fois la même sauvegarde.

Les tests automatiques couvrent validation, annulation, lecture des fichiers, confirmation, non-écrasement, nouveaux identifiants, file de synchronisation et retour arrière SQLite. Le parcours a été contrôlé dans l’aperçu web avec données fictives. Les sélecteurs natifs Android/iOS restent à essayer sur les appareils.
