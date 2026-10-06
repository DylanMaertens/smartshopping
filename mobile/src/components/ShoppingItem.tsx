import React, { useState } from 'react';
import { Keyboard, View } from 'react-native';
import { Button, PageModal, Pressable, Text, TextInput } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { STORE_CATEGORIES } from '@/services/categorization/categoryService';
import { normalizeItemName, truncateUtf8 } from '@/services/itemValidation';
import type { ShoppingItem as ShoppingItemType } from '@/types';

const ALPHABETICAL_CATEGORIES = [...STORE_CATEGORIES].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));

type Props = { item: ShoppingItemType; onDecreaseQuantity: (id: string) => void; onIncreaseQuantity: (id: string) => void;
  onRename: (id: string, name: string, category?: string) => void; onRemove: (id: string) => void; onToggle: (id: string) => void };
export function ShoppingItem({ item, onDecreaseQuantity, onIncreaseQuantity, onRemove, onRename, onToggle }: Props) {
  const { theme } = useTheme();
  const currentCategory = STORE_CATEGORIES.find((entry) => entry.name === item.category)?.name ?? 'À classer';
  const displayName = normalizeItemName(item.name);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);
  const [category, setCategory] = useState(currentCategory);
  const [choosingCategory, setChoosingCategory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function saveName() {
    const name = normalizeItemName(draft);
    if (!name || truncateUtf8(name, 200) !== name) { setError(!name ? 'Le nom ne peut pas être vide.' : 'Ce nom est trop long.'); return; }
    try { onRename(item.id, name, category); setEditing(false); }
    catch { setError('La modification n’a pas pu être enregistrée. Réessaie.'); }
  }
  return <View style={{ borderColor: theme.border, borderRadius: theme.radius, borderWidth: theme.stroke,
    backgroundColor: theme.surface, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', padding: 4, gap: 2 }}>
    <Pressable accessibilityRole="checkbox" accessibilityLabel={`Cocher ${displayName}`} accessibilityState={{ checked: item.checked }}
      onPress={() => onToggle(item.id)} style={{ alignItems: 'center' }}>
      <View style={{ width: 24, height: 24, borderRadius: theme.id === 'pixel' ? 0 : 7, borderWidth: 2,
        borderColor: item.checked ? theme.primary : theme.muted, backgroundColor: item.checked ? theme.primary : theme.surface,
        alignItems: 'center', justifyContent: 'center' }}>
        {item.checked ? <Text style={{ color: theme.onPrimary, fontSize: 16, lineHeight: 20, fontWeight: '800' }}>✓</Text> : null}
      </View>
    </Pressable>
    <Pressable accessibilityLabel={`Modifier ${displayName}`} accessibilityHint="Permet de modifier le nom, choisir un rayon ou supprimer cet article"
      onPress={() => { setDraft(displayName); setCategory(currentCategory); setChoosingCategory(false); setError(null); setEditing(true); }} style={{ flex: 1, minWidth: 82, paddingVertical: 8 }}>
      <Text style={{ fontWeight: '600', textDecorationLine: item.checked ? 'line-through' : 'none', color: item.checked ? theme.muted : theme.text }}>{displayName}</Text>
    </Pressable>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' }}>
      <Pressable accessibilityLabel={`Diminuer la quantité de ${displayName}`} disabled={item.quantity <= 1}
        onPress={() => onDecreaseQuantity(item.id)} style={{ alignItems: 'center' }}><Text style={{ fontSize: 22 }}>−</Text></Pressable>
      <Text accessibilityLabel={`Quantité : ${item.quantity}`} style={{ minWidth: 24, textAlign: 'center', fontWeight: '600' }}>{item.quantity}</Text>
      <Pressable accessibilityLabel={`Augmenter la quantité de ${displayName}`} disabled={item.quantity >= 999}
        onPress={() => onIncreaseQuantity(item.id)} style={{ alignItems: 'center' }}><Text style={{ fontSize: 22 }}>+</Text></Pressable>
    </View>
    {editing ? <PageModal title="Modifier l’article" onClose={() => setEditing(false)}>
      <TextInput autoFocus accessibilityLabel="Nom de l’article" value={draft} onChangeText={setDraft} onSubmitEditing={saveName} returnKeyType="done" />
      <Button variant="secondary" label={`Rayon : ${category}`} accessibilityLabel="Choisir le rayon" onPress={() => { Keyboard.dismiss(); setChoosingCategory(true); }} />
      {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
      <Button label="Enregistrer" onPress={saveName} />
      <Button label="Annuler" variant="ghost" onPress={() => setEditing(false)} />
      <Button label="Supprimer cet article" accessibilityLabel={`Supprimer ${displayName}`} variant="danger" onPress={() => { setEditing(false); onRemove(item.id); }} />
      {choosingCategory ? <PageModal title="Choisir un rayon" onClose={() => setChoosingCategory(false)}>
        {ALPHABETICAL_CATEGORIES.map((entry) => <Pressable key={entry.id} accessibilityRole="radio"
          accessibilityLabel={entry.name} accessibilityState={{ checked: category === entry.name }}
          onPress={() => { setCategory(entry.name); setChoosingCategory(false); }}
          style={{ padding: 12, borderRadius: theme.radius, backgroundColor: category === entry.name ? theme.raised : theme.surface }}>
          <Text>{category === entry.name ? '✓ ' : ''}{entry.name}</Text>
        </Pressable>)}
      </PageModal> : null}
    </PageModal> : null}
  </View>;
}
