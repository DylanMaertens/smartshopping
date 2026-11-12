import React from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Heading, Pressable, Text } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useReducedMotion } from '@/theme/motion';

const help = {
  list: { title: 'Liste de courses', paragraphs: [
    'Coche un article pour le marquer comme pris. Il reste à sa place, barré : touche à nouveau sa case pour annuler une coche accidentelle.',
    'Touche le nom pour le modifier, choisir un rayon ou supprimer l’article. Les boutons + et − permettent de changer la quantité.',
    'Dans ⋯ → Options de la liste, active Bloc-notes pour une présentation compacte à lignes, sans changer ton thème. Tu peux aussi masquer les titres des rayons : leur ordre reste identique et se règle avec Trier.',
    'La présentation est mémorisée pour cette liste sur ton appareil et incluse dans sa sauvegarde. Elle ne change pas celle des autres membres.',
  ] },
  sync: { title: 'Synchronisation', paragraphs: [
    'Seules les listes partagées se synchronisent. Une liste locale reste sur cet appareil et n’affiche pas cet état.',
    'Tes modifications sont enregistrées localement. Hors ligne, celles d’une liste partagée attendent le retour du réseau ; garde l’application ouverte pour vérifier leur envoi.',
    'L’état indique les changements en attente et la dernière synchronisation. Une erreur de connexion ne supprime pas tes articles. Tu peux réessayer avec Synchroniser.',
    'Quand ton accès au partage est retiré, ta copie reste locale. La synchronisation n’est pas une sauvegarde : utilise aussi Sauvegarde et restauration dans Réglages.',
  ] },
  share: { title: 'Partager une liste', paragraphs: [
    'Créer un nouveau code d’invitation fait partie du premium. Rejoindre une liste et gérer les partages existants restent gratuits. Le mode premium se simule dans les réglages des versions de test ; aucun achat n’est encore disponible.',
    'Le partage est facultatif et ne nécessite pas de compte. Une connexion au serveur est nécessaire pour créer une invitation ou gérer les membres.',
    'Crée un code d’invitation, puis transmets le code, le lien ou le QR code uniquement à une personne de confiance. Elle peut utiliser « Rejoindre une liste ». La date de validité est affichée avec le code.',
    'Révoquer un code bloque les nouvelles arrivées, mais les membres déjà présents restent synchronisés. Pour couper leur accès, utilise « Gérer les membres », puis « Retirer ».',
    'Retirer un membre coupe sa synchronisation et révoque les invitations existantes. Sa copie locale reste sur son appareil ; une nouvelle invitation sera nécessaire pour rejoindre à nouveau la liste.',
    'Dans « Gérer les membres », utilise « Renommer » pour reconnaître chaque personne. Ce nom reste privé sur cet appareil et pour cette liste ; il ne modifie pas son identité.',
  ] },
  lists: { title: 'Mes listes', paragraphs: [
    'Ouvre une liste pour retrouver ses articles, ou crée-en une avec « + Nouvelle ». Le menu ⋯ permet de la renommer, de la partager ou de la supprimer.',
    'Tes listes fonctionnent sur cet appareil, même hors ligne. Seules les listes partagées utilisent la synchronisation.',
    'Pour partager ou rejoindre une liste, une connexion au serveur est nécessaire. Dans la version de test, configure son adresse dans Réglages.',
  ] },
  product: { title: 'Ajouter un article · Produit', paragraphs: [
    'Saisis le nom du produit, puis ajoute-le à la liste. Les noms sont ramenés au singulier lorsque la forme est reconnue.',
    'La quantité vaut 1 par défaut. Augmente-la uniquement si tu en as besoin.',
    'Si le produit est « À classer », tu peux choisir son rayon. Ce choix facultatif est mémorisé sur cet appareil après l’ajout.',
  ] },
  barcode: { title: 'Ajouter un article · Code-barres', paragraphs: [
    'Place le code-barres dans le cadre et garde-le stable : le produit est ajouté après sa lecture. Éloigne un peu le produit si la caméra ne fait pas le point.',
    'Les icônes du cadre permettent de relancer la caméra, d’allumer la lampe et d’agrandir ou réduire la zone de scan.',
    'Tu peux nommer un produit inconnu, même hors ligne, et modifier son nom pour toi seul. Après un nommage hors ligne, un scan connecté peut proposer une seule fois le nom trouvé au catalogue.',
  ] },
  text: { title: 'Ajouter un article · Liste écrite', paragraphs: [
    'Cadre uniquement la liste, puis photographie-la. Agrandis le cadre si nécessaire. La photo est analysée sur ton serveur : une connexion est requise.',
    'Les séparateurs reconnus deviennent des retours à la ligne, sauf les mots composés connus. Vérifie le découpage et les mots avant l’ajout.',
    'Un article par ligne ; « 2 x lait » pour une quantité. Tu peux corriger le texte, choisir ou refuser les suggestions et annuler la dernière correction. Aucun ajout sans ta validation.',
  ] },
  voice: { title: 'Ajouter un article · Dicter', paragraphs: [
    'La reconnaissance française fonctionne localement sur Android 12 minimum, avec un moteur vocal compatible. Ta voix est traitée sur cet appareil ; Poduna ne conserve aucun enregistrement audio.',
    'Dis par exemple « deux oranges, puis du lait, puis trois yaourts ». Utilise « puis » pour séparer les produits ; relis les poids et les marques.',
    'Un article par ligne, « 2 x lait » pour une quantité. Choisis les corrections proposées ou conserve le texte entendu : aucun ajout sans ta validation.',
    'Ouvrir cette aide interrompt une dictée en cours. Le brouillon déjà reconnu reste disponible.',
  ] },
};
export type HelpTopic = keyof typeof help;

/** Small visual icon, full accessible touch target; stays inside its parent modal. */
export function PageHelp({ topic, open, onOpen, onClose }: {
  topic: HelpTopic; open: boolean; onOpen: () => void; onClose: () => void;
}) {
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  const content = help[topic];
  return <>
    <Pressable accessibilityLabel={`Aide — ${content.title}`} accessibilityHint="Ouvre les instructions"
      accessibilityState={{ expanded: open }} onPress={onOpen}
      style={{ minHeight: 48, minWidth: 48, alignItems: 'center', flexShrink: 0 }}>
      <View style={{ width: 23, height: 23, borderRadius: 12, borderWidth: 1.5, borderColor: theme.primary,
        alignItems: 'center', justifyContent: 'center' }}>
        <Text accessible={false} style={{ color: theme.primary, fontWeight: '700', fontSize: 16, lineHeight: 21 }}>i</Text>
      </View>
    </Pressable>
    {open ? <Modal transparent visible animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={onClose} testID="page-help-modal">
      <SafeAreaView style={{ flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: 20 }}>
        <View accessibilityViewIsModal style={{ maxHeight: '90%', width: '100%', maxWidth: 520, alignSelf: 'center',
          backgroundColor: theme.surface, borderRadius: theme.radius, borderWidth: theme.stroke, borderColor: theme.border }}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            <Heading accessibilityRole="header" style={{ fontSize: 23, lineHeight: 30 }}>{content.title}</Heading>
            {content.paragraphs.map(paragraph => <Text key={paragraph}>{paragraph}</Text>)}
          </ScrollView>
          <View style={{ padding: 16 }}><Button label="Fermer l’aide" onPress={onClose} /></View>
        </View>
      </SafeAreaView>
    </Modal> : null}
  </>;
}
