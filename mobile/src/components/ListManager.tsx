import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, PageModal, Pressable, Text, TextInput } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { ListActions } from './ListActions';
import type { ShoppingList } from '@/types';

type Props = {
  activeListId: string;
  lists: ShoppingList[];
  onArchive: (listId: string) => void;
  onCreate: (name: string) => void;
  onRename: (listId: string, name: string) => void;
  onShare: (listId: string) => void;
  onSelect: (listId: string) => void;
};

export function ListManager({ activeListId, lists, onArchive, onCreate, onRename, onSelect, onShare }: Props) {
  const { theme } = useTheme();
  const [menuId, setMenuId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  function createList() {
    const cleaned = name.trim().replace(/\s+/gu, ' ');
    if (!cleaned) return;
    try { onCreate(cleaned); setCreating(false); }
    catch { setError('La liste n’a pas pu être créée. Réessaie.'); }
  }
  return <View style={{ gap: 12 }}>
      {lists.map((list) => <View key={list.id} style={{ borderRadius: theme.radius, backgroundColor: theme.surface,
        borderWidth: theme.stroke, borderColor: list.id === activeListId ? theme.primary : theme.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8, gap: 4 }}>
          <Pressable accessibilityState={{ selected: list.id === activeListId }} onPress={() => onSelect(list.id)}
            style={{ flex: 1, padding: 12 }}>
            <Text style={{ fontWeight: '700' }}>{list.name}</Text>
            {list.syncDisabled ? <Text style={{ color: theme.muted, fontSize: 13 }}>Synchronisation coupée</Text> : null}
          </Pressable>
          <Pressable accessibilityLabel={`Options de ${list.name}`} accessibilityState={{ expanded: menuId === list.id }}
            onPress={() => setMenuId(menuId === list.id ? null : list.id)} style={{ alignItems: 'center', alignSelf: 'stretch' }}>
            <Text style={{ fontSize: 26 }}>⋯</Text>
          </Pressable>
        </View>
        {menuId === list.id ? <View style={{ borderTopWidth: theme.stroke, borderColor: theme.border, padding: 8, gap: 4 }}>
          <ListActions shareDisabled={list.syncDisabled} list={list} canDelete={lists.length > 1} onRename={onRename}
            onShare={(listId) => { setMenuId(null); onShare(listId); }}
            onDelete={(listId) => { onArchive(listId); setMenuId(null); }} />
        </View> : null}
      </View>)}
      <Button label="+ Nouvelle" onPress={() => { setName(''); setError(null); setCreating(true); }} />
      {creating ? <PageModal title="Nouvelle liste" onClose={() => setCreating(false)}>
        <TextInput autoFocus maxLength={200} accessibilityLabel="Nom de la nouvelle liste" placeholder="Ex. Courses de la semaine" value={name}
          onChangeText={(value) => { setName(value); setError(null); }} onSubmitEditing={createList} returnKeyType="done" />
        {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
        <Button label="Créer la liste" disabled={!name.trim()} onPress={createList} />
        <Button label="Annuler" variant="ghost" onPress={() => setCreating(false)} />
      </PageModal> : null}
  </View>;
}
