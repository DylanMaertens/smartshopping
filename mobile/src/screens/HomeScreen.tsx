import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BarcodeScannerPanel } from '@/components/BarcodeScannerPanel';
import { CategorySection } from '@/components/CategorySection';
import { classifyProductLocally, STORE_CATEGORIES } from '@/services/categorization/categoryService';
import { getProduct } from '@/services/api/backend';
import { ShoppingListStorage } from '@/services/storage/shoppingListStorage';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import type { CategorySection as CategorySectionType, ShoppingItem } from '@/types';

const DEMO_LIST_ID = 'local-demo-list';

export function HomeScreen() {
  const [inputValue, setInputValue] = useState('');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const syncEngine = useOfflineSync();
  const [items, setItems] = useState<ShoppingItem[]>(() => {
    const persistedItems = ShoppingListStorage.getCurrentList();
    if (persistedItems.length > 0) return persistedItems;

    return [createShoppingItem('Lait demi-écrémé'), createShoppingItem('Pommes'), createShoppingItem('Lessive')];
  });

  const visibleItems = useMemo(() => items.filter((item) => !item.deletedAt), [items]);
  const sections = useMemo(() => groupItemsByCategory(visibleItems), [visibleItems]);
  const remainingCount = visibleItems.filter((item) => !item.checked).length;
  const pendingChangesCount = ShoppingListStorage.getPendingChanges(items).length;

  useEffect(() => {
    ShoppingListStorage.saveCurrentList(items);
  }, [items]);

  function addItem() {
    const name = inputValue.trim();
    if (!name) return;

    setItems((current) => [createShoppingItem(name), ...current]);
    setInputValue('');
  }

  async function addItemFromBarcode(barcode: string) {
    setScannerVisible(false);
    setScanStatus(`Code-barres scanné : ${barcode}`);

    try {
      const product = await getProduct(barcode);
      setItems((current) => [
        createShoppingItem(product.product_name, {
          barcode: product.barcode,
          category: product.categories[0],
        }),
        ...current,
      ]);
      setScanStatus(`Produit ajouté : ${product.product_name}`);
    } catch {
      setItems((current) => [createShoppingItem(`Produit ${barcode}`, { barcode }), ...current]);
      setScanStatus(`Produit ajouté hors-ligne avec le code ${barcode}`);
    }
  }

  function toggleItem(id: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, checked: !item.checked, updatedAt: Date.now() } : item,
      ),
    );
  }

  function increaseQuantity(id: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, quantity: item.quantity + 1, updatedAt: Date.now() } : item,
      ),
    );
  }

  function decreaseQuantity(id: string) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        return { ...item, quantity: Math.max(1, item.quantity - 1), updatedAt: Date.now() };
      }),
    );
  }

  function removeItem(id: string) {
    const now = Date.now();
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, deletedAt: now, updatedAt: now } : item,
      ),
    );
  }

  async function syncCurrentList() {
    const pendingChanges = ShoppingListStorage.getPendingChanges(items);
    if (pendingChanges.length === 0) {
      setSyncStatus('Aucun changement à synchroniser.');
      return;
    }

    setSyncStatus(`Synchronisation de ${pendingChanges.length} changement(s)…`);

    try {
      const result = await syncEngine.syncListIfOnline(
        DEMO_LIST_ID,
        pendingChanges,
        ShoppingListStorage.getLastSyncTimestamp(),
      );

      if (!result.synced) {
        setSyncStatus(result.reason === 'offline' ? 'Hors ligne: sync reportée.' : 'Sync indisponible.');
        return;
      }

      const syncedItems = ShoppingListStorage.markAsSynced(items, result.response.server_time);
      const mergedItems = ShoppingListStorage.applyRemoteChanges(syncedItems, result.remoteItems);
      setItems(mergedItems);
      setSyncStatus(
        result.response.conflicts.length > 0
          ? `${result.response.conflicts.length} conflit(s) résolu(s) en LWW.`
          : 'Liste synchronisée.',
      );
    } catch {
      setSyncStatus('Erreur sync: changements conservés en local.');
    }
  }

  function resetList() {
    ShoppingListStorage.clearCurrentList();
    setItems([]);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 30, fontWeight: '800' }}>SmartShopping</Text>
        <Text style={{ color: '#475569', fontSize: 16 }}>
          Ajoute un produit, l’app le classe automatiquement dans un rayon magasin générique.
        </Text>
      </View>

      <View
        style={{
          backgroundColor: '#f8fafc',
          borderColor: '#e2e8f0',
          borderRadius: 16,
          borderWidth: 1,
          gap: 12,
          padding: 16,
        }}
      >
        <Text style={{ color: '#334155', fontSize: 16, fontWeight: '700' }}>
          {remainingCount} article{remainingCount > 1 ? 's' : ''} restant{remainingCount > 1 ? 's' : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            onChangeText={setInputValue}
            onSubmitEditing={addItem}
            placeholder="Ex: pain, dentifrice, saumon..."
            returnKeyType="done"
            style={{
              backgroundColor: '#ffffff',
              borderColor: '#cbd5e1',
              borderRadius: 12,
              borderWidth: 1,
              flex: 1,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
            value={inputValue}
          />
          <Pressable
            onPress={addItem}
            style={{
              alignItems: 'center',
              backgroundColor: '#0f172a',
              borderRadius: 12,
              justifyContent: 'center',
              paddingHorizontal: 16,
            }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '700' }}>Ajouter</Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() => setScannerVisible((visible) => !visible)}
          style={{ alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 12, padding: 12 }}
        >
          <Text style={{ color: '#ffffff', fontWeight: '700' }}>
            {scannerVisible ? 'Masquer le scanner' : 'Scanner un code-barres'}
          </Text>
        </Pressable>
        {scanStatus ? <Text style={{ color: '#475569' }}>{scanStatus}</Text> : null}
      </View>

      <View style={{ backgroundColor: '#eff6ff', borderRadius: 16, gap: 10, padding: 16 }}>
        <Text style={{ color: '#1e3a8a', fontSize: 16, fontWeight: '700' }}>Synchronisation</Text>
        <Text style={{ color: '#475569' }}>
          {pendingChangesCount} changement{pendingChangesCount > 1 ? 's' : ''} en attente.
        </Text>
        <Pressable
          onPress={syncCurrentList}
          style={{ alignItems: 'center', backgroundColor: '#1d4ed8', borderRadius: 12, padding: 12 }}
        >
          <Text style={{ color: '#ffffff', fontWeight: '700' }}>Synchroniser maintenant</Text>
        </Pressable>
        {syncStatus ? <Text style={{ color: '#1e3a8a' }}>{syncStatus}</Text> : null}
      </View>

      {scannerVisible ? (
        <BarcodeScannerPanel onCancel={() => setScannerVisible(false)} onScanned={addItemFromBarcode} />
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Pressable onPress={resetList} style={{ paddingVertical: 8 }}>
          <Text style={{ color: '#dc2626', fontWeight: '700' }}>Vider la liste</Text>
        </Pressable>
      </View>

      {sections.map((section) => (
        <CategorySection
          key={section.categoryName}
          onDecreaseQuantity={decreaseQuantity}
          onIncreaseQuantity={increaseQuantity}
          onRemoveItem={removeItem}
          onToggleItem={toggleItem}
          section={section}
        />
      ))}
    </ScrollView>
  );
}

function createShoppingItem(
  name: string,
  overrides: Pick<Partial<ShoppingItem>, 'barcode' | 'category'> = {},
): ShoppingItem {
  const category = classifyProductLocally(name);
  const now = Date.now();

  return {
    id: `${now}-${Math.random().toString(36).slice(2)}`,
    listId: DEMO_LIST_ID,
    name,
    barcode: overrides.barcode,
    category: overrides.category ?? category.categoryName,
    quantity: 1,
    checked: false,
    updatedAt: now,
  };
}

function groupItemsByCategory(items: ShoppingItem[]): CategorySectionType[] {
  const orderByCategory = new Map(STORE_CATEGORIES.map((category) => [category.name, category.orderIndex]));
  const grouped = items.reduce<Map<string, ShoppingItem[]>>((acc, item) => {
    const category = item.category ?? 'À classer';
    acc.set(category, [...(acc.get(category) ?? []), item]);
    return acc;
  }, new Map());

  return Array.from(grouped.entries())
    .map(([categoryName, categoryItems]) => ({
      categoryName,
      orderIndex: orderByCategory.get(categoryName) ?? 999,
      items: categoryItems,
    }))
    .sort((left, right) => left.orderIndex - right.orderIndex);
}
