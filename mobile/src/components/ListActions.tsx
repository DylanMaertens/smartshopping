import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Button, PageModal, Text, TextInput } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import type { ShoppingList } from '@/types';

type Props = {
  list: Pick<ShoppingList, 'id' | 'name'>;
  canDelete: boolean;
  shareDisabled?: boolean;
  onShare?: (listId: string) => void;
  onRename: (listId: string, name: string) => void;
  onDelete: (listId: string) => void;
};

/** Same list actions in the list directory and the open list's options. */
export function ListActions({ list, canDelete, shareDisabled, onShare, onRename, onDelete }: Props) {
  const { theme } = useTheme();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cleanedName = name.trim().replace(/\s+/gu, ' ');

  function saveName() {
    if (!cleanedName || cleanedName === list.name) return;
    try {
      onRename(list.id, cleanedName);
      setEditing(false);
    } catch {
      setError('Le nom n’a pas pu être enregistré. Réessaie.');
    }
  }

  return <>
    {onShare ? <Button variant="secondary" label="Partager" disabled={shareDisabled} accessibilityLabel={`Partager la liste ${list.name}`} onPress={() => onShare(list.id)} /> : null}
    <Button variant="secondary" label="Renommer" accessibilityLabel={`Renommer la liste ${list.name}`} onPress={() => {
      setName(list.name); setError(null); setEditing(true);
    }} />
    <Button variant="danger" label="Supprimer" accessibilityLabel={`Supprimer la liste ${list.name}`} disabled={!canDelete} onPress={() => {
      Alert.alert(`Supprimer « ${list.name} » ?`,
        'Cette liste sera retirée de cet appareil. Les autres membres la conservent. Les changements non envoyés restent sur cet appareil tant que la liste n’est pas rejointe à nouveau.', [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Supprimer', style: 'destructive', onPress: () => {
            try { onDelete(list.id); }
            catch { Alert.alert('Suppression impossible', 'La liste est conservée. Réessaie.'); }
          } },
        ]);
    }} />
    {!canDelete ? <Text style={{ color: theme.muted, fontSize: 14, padding: 8 }}>Conserve au moins une liste.</Text> : null}
    {editing ? <PageModal title="Renommer la liste" onClose={() => setEditing(false)}>
      <Text style={{ color: theme.muted }}>Si cette liste est partagée, le nouveau nom sera transmis à tous ses membres.</Text>
      <TextInput autoFocus maxLength={200} accessibilityLabel="Nom de la liste" placeholder="Nom de la liste" value={name}
        onChangeText={(value) => { setName(value); setError(null); }} returnKeyType="done" onSubmitEditing={saveName} />
      {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
      <Button label="Enregistrer" disabled={!cleanedName || cleanedName === list.name} onPress={saveName} />
      <Button variant="ghost" label="Annuler" onPress={() => setEditing(false)} />
    </PageModal> : null}
  </>;
}
