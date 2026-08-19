import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BarcodeScannerPanel } from '@/components/BarcodeScannerPanel';
import { CategorySection } from '@/components/CategorySection';
import { DeviceDiagnosticsCard } from '@/components/DeviceDiagnosticsCard';
import { ListManager } from '@/components/ListManager';
import { ShareListCard } from '@/components/ShareListCard';
import { SyncStatusCard, type SyncPhase } from '@/components/SyncStatusCard';
import { classifyProductLocally, STORE_CATEGORIES } from '@/services/categorization/categoryService';
import { BackendApiError, getConfiguredApiBaseUrl, getProduct } from '@/services/api/backend';
import { ShoppingListStorage } from '@/services/storage/shoppingListStorage';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import type { CategorySection as CategorySectionType, ShoppingItem, ShoppingList } from '@/types';

export function HomeScreen() {
  const inputRef = useRef<TextInput>(null);
  const previousOnlineRef = useRef<boolean | null>(null);
  const syncInFlightRef = useRef(false);
  const [inputValue, setInputValue] = useState('');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>('idle');
  const [lists, setLists] = useState<ShoppingList[]>(() => ShoppingListStorage.getLists());
  const [activeListId, setActiveListId] = useState(() => ShoppingListStorage.getActiveListId());
  const activeListIdRef = useRef(activeListId);
  const [lastSyncAt, setLastSyncAt] = useState(() =>
    ShoppingListStorage.getLastSyncTimestamp(ShoppingListStorage.getActiveListId()),
  );
  const { networkState, syncEngine } = useOfflineSync();
  const [items, setItems] = useState<ShoppingItem[]>(() => {
    const persistedItems = ShoppingListStorage.getCurrentList(ShoppingListStorage.getActiveListId());
    if (persistedItems.length > 0) return persistedItems;

    return [createShoppingItem('Lait demi-écrémé'), createShoppingItem('Pommes'), createShoppingItem('Lessive')];
  });

  const visibleItems = useMemo(() => items.filter((item) => !item.deletedAt), [items]);
  const sections = useMemo(() => groupItemsByCategory(visibleItems), [visibleItems]);
  const remainingCount = visibleItems.filter((item) => !item.checked).length;
  const pendingChangesCount = ShoppingListStorage.getPendingChanges(activeListId, items).length;

  useEffect(() => {
    activeListIdRef.current = activeListId;
    ShoppingListStorage.saveCurrentList(activeListId, items);
  }, [activeListId, items]);

  useEffect(() => {
    if (pendingChangesCount > 0 && syncPhase === 'synced') {
      setSyncPhase('idle');
      setSyncStatus('Modifications locales en attente.');
    }
  }, [pendingChangesCount, syncPhase]);

  function addItem() {
    const name = inputValue.trim();
    if (!name) return;

    setItems((current) => [createShoppingItem(name), ...current]);
    setInputValue('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function addItemFromBarcode(barcode: string) {
    setScannerVisible(false);
    const pendingItem = createShoppingItem(`Produit ${barcode}`, { barcode });
    setItems((current) => [pendingItem, ...current]);
    setScanStatus(`Produit ajouté, enrichissement en cours… (${barcode})`);

    try {
      const product = await getProduct(barcode);
      setItems((current) =>
        current.map((item) =>
          item.id === pendingItem.id
            ? {
                ...item,
                name: product.product_name,
                barcode: product.barcode,
                category: product.categories[0] ?? item.category,
                updatedAt: Date.now(),
              }
            : item,
        ),
      );
      setScanStatus(`Produit enrichi : ${product.product_name}`);
    } catch (error) {
      const reference = error instanceof BackendApiError ? ` Référence : ${error.requestId}.` : '';
      setScanStatus(`Produit conservé hors-ligne. API non jointe: ${getConfiguredApiBaseUrl()}.${reference}`);
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

  const syncCurrentList = useCallback(async (trigger: 'manual' | 'reconnect' | 'periodic' = 'manual') => {
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;

    const syncingListId = activeListId;
    const pendingChanges = ShoppingListStorage.getPendingChanges(activeListId, items);
    setSyncPhase('syncing');
    setSyncStatus(
      trigger === 'reconnect'
        ? 'Connexion rétablie, reprise de la synchronisation…'
        : trigger === 'periodic'
        ? 'Synchronisation périodique au premier plan…'
        : pendingChanges.length > 0
        ? `Synchronisation de ${pendingChanges.length} changement(s)…`
        : 'Recherche de changements distants…',
    );

    try {
      const result = await syncEngine.syncListIfOnline(
        activeListId,
        pendingChanges,
        ShoppingListStorage.getLastSyncTimestamp(activeListId),
      );

      if (!result.synced) {
        setSyncPhase(result.reason === 'offline' ? 'offline' : 'error');
        setSyncStatus(result.reason === 'offline' ? 'Hors ligne: sync reportée.' : 'Sync indisponible.');
        return;
      }

      const syncedItems = ShoppingListStorage.markAsSynced(activeListId, items, result.response.server_time);
      const mergedItems = ShoppingListStorage.applyRemoteChanges(activeListId, syncedItems, result.remoteItems);
      if (activeListIdRef.current !== syncingListId) return;

      setItems(mergedItems);
      setLastSyncAt(result.response.server_time);
      setSyncPhase('synced');
      setSyncStatus(
        result.response.conflicts.length > 0
          ? `${result.response.conflicts.length} conflit(s) résolu(s) en LWW.`
          : 'Liste synchronisée.',
      );
    } catch (error) {
      if (activeListIdRef.current !== syncingListId) return;
      setSyncPhase('error');
      const reference = error instanceof BackendApiError ? ` Référence : ${error.requestId}.` : '';
      setSyncStatus(`Erreur sync: changements conservés en local.${reference}`);
    } finally {
      syncInFlightRef.current = false;
    }
  }, [activeListId, items, syncEngine]);

  useEffect(() => {
    if (networkState.isConnected === undefined) return;

    const online = networkState.isConnected === true && networkState.isInternetReachable !== false;
    const wasOnline = previousOnlineRef.current;
    previousOnlineRef.current = online;

    if (wasOnline === false && online) {
      void syncCurrentList('reconnect');
    }
  }, [networkState.isConnected, networkState.isInternetReachable, syncCurrentList]);

  useEffect(() => {
    const online = networkState.isConnected === true && networkState.isInternetReachable !== false;
    if (!online) return undefined;

    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        void syncCurrentList('periodic');
      }
    }, 5 * 60 * 1_000);

    return () => clearInterval(interval);
  }, [networkState.isConnected, networkState.isInternetReachable, syncCurrentList]);

  function resetList() {
    setItems(ShoppingListStorage.clearCurrentList(activeListId));
  }

  function selectList(listId: string) {
    ShoppingListStorage.setActiveList(listId);
    activeListIdRef.current = listId;
    setActiveListId(listId);
    setItems(ShoppingListStorage.getCurrentList(listId));
    setLastSyncAt(ShoppingListStorage.getLastSyncTimestamp(listId));
    setSyncPhase('idle');
    setSyncStatus(null);
  }

  function createList() {
    const created = ShoppingListStorage.createList(`Liste ${lists.length + 1}`);
    setLists(ShoppingListStorage.getLists());
    selectList(created.id);
  }

  function renameList(name: string) {
    ShoppingListStorage.renameList(activeListId, name);
    setLists(ShoppingListStorage.getLists());
  }

  function archiveList() {
    const nextId = ShoppingListStorage.archiveList(activeListId);
    setLists(ShoppingListStorage.getLists());
    selectList(nextId);
  }

  function joinSharedList(listId: string) {
    ShoppingListStorage.importSharedList(listId);
    setLists(ShoppingListStorage.getLists());
    selectList(listId);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 30, fontWeight: '800' }}>SmartShopping</Text>
        <Text style={{ color: '#475569', fontSize: 16 }}>
          Ajoute un produit, l’app le classe automatiquement dans un rayon magasin générique.
        </Text>
      </View>

      <ListManager
        activeListId={activeListId}
        lists={lists}
        onArchive={archiveList}
        onCreate={createList}
        onRename={renameList}
        onSelect={selectList}
      />

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
            ref={inputRef}
            blurOnSubmit={false}
            onChangeText={setInputValue}
            onSubmitEditing={addItem}
            placeholder="Ex: pain, dentifrice, saumon..."
            returnKeyType="done"
            testID="add-item-input"
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
            testID="add-item-button"
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

      <SyncStatusCard
        lastSyncAt={lastSyncAt}
        message={syncStatus}
        networkState={networkState}
        onSync={() => void syncCurrentList('manual')}
        pendingCount={pendingChangesCount}
        phase={syncPhase}
      />

      <DeviceDiagnosticsCard />

      <ShareListCard listId={activeListId} onJoined={joinSharedList} />

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
  overrides: Pick<Partial<ShoppingItem>, 'id' | 'barcode' | 'category'> = {},
): ShoppingItem {
  const category = classifyProductLocally(name);
  const now = Date.now();

  return {
    id: overrides.id ?? `${now}-${Math.random().toString(36).slice(2)}`,
    listId: ShoppingListStorage.getActiveListId(),
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
