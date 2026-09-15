import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { ShoppingList } from '@/types';

type Props = {
  activeListId: string;
  lists: ShoppingList[];
  onArchive: () => void;
  onCreate: () => void;
  onRename: (name: string) => void;
  onSelect: (listId: string) => void;
};

export function ListManager({ activeListId, lists, onArchive, onCreate, onRename, onSelect }: Props) {
  const activeList = lists.find((list) => list.id === activeListId);
  const [name, setName] = useState(activeList?.name ?? '');

  useEffect(() => setName(activeList?.name ?? ''), [activeList?.name]);

  return (
    <View style={{ backgroundColor: '#f8fafc', borderRadius: 16, gap: 12, padding: 16 }}>
      <Text style={{ color: '#334155', fontSize: 16, fontWeight: '700' }}>Mes listes</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {lists.map((list) => {
          const active = list.id === activeListId;
          return (
            <Pressable
              key={list.id}
              onPress={() => onSelect(list.id)}
              style={{ backgroundColor: active ? '#0f172a' : '#e2e8f0', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}
            >
              <Text style={{ color: active ? '#ffffff' : '#334155', fontWeight: '700' }}>{list.name}</Text>
            </Pressable>
          );
        })}
        <Pressable onPress={onCreate} style={{ borderColor: '#94a3b8', borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Text style={{ color: '#334155', fontWeight: '700' }}>+ Nouvelle</Text>
        </Pressable>
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          onChangeText={setName}
          placeholder="Nom de la liste"
          style={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: 10, borderWidth: 1, flex: 1, paddingHorizontal: 10 }}
          value={name}
        />
        <Pressable
          disabled={!name.trim() || name.trim() === activeList?.name}
          onPress={() => onRename(name.trim())}
          style={{ backgroundColor: '#475569', borderRadius: 10, justifyContent: 'center', paddingHorizontal: 12 }}
        >
          <Text style={{ color: '#ffffff', fontWeight: '700' }}>Renommer</Text>
        </Pressable>
      </View>
      {lists.length > 1 ? (
        <Pressable onPress={onArchive} style={{ alignSelf: 'flex-end', paddingVertical: 4 }}>
          <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Archiver cette liste</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
