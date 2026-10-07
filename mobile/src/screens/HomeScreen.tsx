import { TestServerCard } from '@/components/TestServerCard';
import { canConfigureTestServer, getTestServerUrl } from '@/services/api/testServer';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Keyboard, Linking, Modal, ScrollView, TextInput as NativeTextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Heading, PageModal, Pressable, Text, TextInput } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { BasketIllustration } from '@/components/BasketIllustration';
import { AppearancePicker } from '@/components/AppearancePicker';
import { parseInvitationCode } from '@/services/api/invitationCode';
import { OcrImportPanel } from '@/components/OcrImportPanel';
import { mergeOcrItems, type OcrItem } from '@/services/ocrItems';
import { BarcodeScannerPanel } from '@/components/BarcodeScannerPanel';
import { UnknownProductPrompt } from '@/components/UnknownProductPrompt';
import { CategoryOrderPanel } from '@/components/CategoryOrderPanel';
import { CategorySection } from '@/components/CategorySection';
import { DeviceDiagnosticsCard } from '@/components/DeviceDiagnosticsCard';
import { AppFooter } from '@/components/AppFooter';
import { BackupPanel } from '@/components/BackupPanel';
import { ListActions } from '@/components/ListActions';
import { ListManager } from '@/components/ListManager';
import { InvitationSession } from '@/services/api/invitationSession';
import { JoinListCard } from '@/components/JoinListCard';
import { ShareListCard } from '@/components/ShareListCard';
import { SyncStatusCard, type SyncPhase } from '@/components/SyncStatusCard';
import { classifyProductLocally, STORE_CATEGORIES } from '@/services/categorization/categoryService';
import { BackendApiError, confirmCommunityProposal, getCommunitySuggestions, getProduct, submitCommunityProposal, type CommunitySuggestion } from '@/services/api/backend';
import { ShoppingListStorage } from '@/services/storage/shoppingListStorage';
import { DebouncedListSync } from '@/services/sync/debouncedListSync';
import { startRemoteRefresh } from '@/services/sync/remoteRefresh';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useExpiringMessage } from '@/hooks/useExpiringMessage';
import { getProductPreference, saveProductPreference } from '@/services/storage/productPreferences';
import { itemNameKey, normalizeItemName, truncateUtf8 } from '@/services/itemValidation';
import { groupItemsByCategory } from '@/services/categorization/categoryOrder';
import { groupEquivalentItems, getEquivalentItems, incrementGroup, decrementGroup } from '@/services/itemGroups';
import { sortItemsForDisplay } from '@/services/itemOrder';
import type { ShoppingItem, ShoppingList } from '@/types';

export function HomeScreen() {
  const { theme } = useTheme();
  const serverMissing = canConfigureTestServer() && !getTestServerUrl();
  const [panel, setPanel] = useState<'add' | 'share' | 'settings' | 'sync' | 'options' | 'backup' | 'join' | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [checkedExpanded, setCheckedExpanded] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [addedMessage, setAddedMessage] = useExpiringMessage();
  const [invitationSession] = useState(() => new InvitationSession());
  const [sharingListId, setSharingListId] = useState<string | null>(null);
  const [invitationCode, setInvitationCode] = useState<string | undefined>();
  const inputRef = useRef<NativeTextInput>(null);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const backgroundSyncRef = useRef<Promise<void> | null>(null);
  const previousOnlineRef = useRef<boolean | null>(null);
  const syncInFlightRef = useRef<{ listId: string; promise: Promise<boolean> } | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [ocrListId, setOcrListId] = useState<string | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const pendingProductLookups = useRef(new Set<string>());
  const [unknownProducts, setUnknownProducts] = useState<{ id: string; barcode: string; listId: string; suggestions: CommunitySuggestion[]; communityAvailable: boolean }[]>([]);
  const [scanStatus, setScanStatus] = useExpiringMessage();
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>('idle');
  const [lists, setLists] = useState<ShoppingList[]>(() => ShoppingListStorage.getLists());
  const [activeListId, setActiveListId] = useState(() => ShoppingListStorage.getActiveListId());
  const activeListIdRef = useRef(activeListId);
  const [categoryOrder, setCategoryOrder] = useState(() => ShoppingListStorage.getCategoryOrder(activeListId));
  const [orderingListId, setOrderingListId] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState(() =>
    ShoppingListStorage.getLastSyncTimestamp(ShoppingListStorage.getActiveListId()),
  );
  const { networkState, syncEngine } = useOfflineSync();
  const [items, setItems] = useState<ShoppingItem[]>(() =>
    ShoppingListStorage.getCurrentList(ShoppingListStorage.getActiveListId()),
  );
  const itemsRef = useRef(items);
  const unknownProduct = unknownProducts.find((product) => product.listId === activeListId
    && items.some((item) => item.id === product.id && !item.deletedAt && item.name === `Produit ${product.barcode}`));
  useEffect(() => { setUnknownProducts([]); }, [activeListId]);

  const visibleItems = useMemo(() => groupEquivalentItems(items), [items]);
  const sections = useMemo(() => groupItemsByCategory(visibleItems.filter((item) => !item.checked), categoryOrder), [visibleItems, categoryOrder]);
  const remainingCount = visibleItems.filter((item) => !item.checked).length;
  const pendingChangesCount = ShoppingListStorage.getPendingChangesCount(activeListId);
  const syncEnabledListIds = JSON.stringify(lists.filter((list) => ShoppingListStorage.isSyncEnabled(list.id)).map((list) => list.id).sort());

  useEffect(() => {
    let mounted = true;
    const receive = (url: string | null) => {
      const code = url ? parseInvitationCode(url) : null;
      if (mounted && code) {
        setInvitationCode(code); setScannerVisible(false); setOcrListId(null); setOrderingListId(null); setPanel('join');
      }
    };
    void Linking.getInitialURL().then(receive).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => receive(url));
    return () => { mounted = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!listOpen || panel !== null) return false;
      Keyboard.dismiss(); setListOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [listOpen, panel]);

  function showItems(next: ShoppingItem[]) {
    itemsRef.current = next;
    setItems(next);
  }

  function updateItems(update: (current: ShoppingItem[]) => ShoppingItem[]) {
    const listId = activeListIdRef.current;
    const next = update(itemsRef.current);
    const changed = next.length !== itemsRef.current.length || next.some((item, i) => item !== itemsRef.current[i]);
    ShoppingListStorage.saveCurrentList(listId, next);
    if (changed) pendingSync.schedule(listId);
    showItems(ShoppingListStorage.getCurrentList(listId));
  }

  useEffect(() => {
    if (pendingChangesCount > 0 && syncPhase === 'synced') {
      setSyncPhase('idle');
      setSyncStatus('Modifications locales en attente : envoi automatique après 1 seconde sans changement.');
    }
  }, [pendingChangesCount, syncPhase]);

  function addItem() {
    const name = normalizeItemName(inputValue);
    if (!name) return;
    if (truncateUtf8(name, 200) !== name) {
      setInputError('Ce nom est trop long. Raccourcis-le avant de l’ajouter.');
      return;
    }

    const amount = Number(quantity);
    if (!/^\d+$/.test(quantity) || !Number.isInteger(amount) || amount < 1 || amount > 999) {
      setInputError('Choisis une quantité entière entre 1 et 999.'); return;
    }
    const existing = groupEquivalentItems(itemsRef.current).find((item) => itemNameKey(item.name) === itemNameKey(name));
    if (existing && existing.quantity + amount > 999) {
      setInputError('La quantité totale ne peut pas dépasser 999.');
      return;
    }
    setInputError(null);
    if (existing) incrementExistingItem(existing.id, amount);
    else updateItems((current) => [{ ...createShoppingItem(name), quantity: amount }, ...current]);
    setAddedMessage(`${name} · ${amount} ajouté${amount > 1 ? 's' : ''}`);
    setQuantity('1');
    setInputValue('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function importRecognizedItems(drafts: OcrItem[]) {
    if (activeListIdRef.current !== ocrListId) throw new Error('La liste a changé. Ferme cet écran et réessaie.');
    const merged = mergeOcrItems(itemsRef.current, drafts, createShoppingItem);
    updateItems(() => merged);
    setOcrListId(null);
    setScanStatus(`${drafts.length} ligne(s) ajoutée(s) depuis la photo.`);
  }

  function incrementExistingItem(id: string, amount = 1) {
    updateItems((current) => incrementGroup(current, id, amount, true));
  }

  async function addItemFromBarcode(barcode: string) {
    if (!/^[0-9]{8,14}$/.test(barcode)) return;
    const existing = itemsRef.current.find((item) => !item.deletedAt && item.barcode === barcode);
    if (existing) {
      if (getEquivalentItems(itemsRef.current, existing.id).reduce((sum, item) => sum + item.quantity, 0) >= 999) setScanStatus('La quantité maximale de cet article est déjà atteinte (999).');
      else {
        incrementExistingItem(existing.id);
        setScanStatus(`Quantité augmentée : ${normalizeItemName(existing.name)}`);
      }
      if (existing.name === `Produit ${barcode}` && !pendingProductLookups.current.has(existing.id)) offerProductName(existing.id, barcode, []);
      return;
    }
    const preference = getProductPreference(barcode);
    if (preference) {
      updateItems((current) => [createShoppingItem(preference.name, {
        barcode, category: preference.category ?? classifyProductLocally(preference.name).categoryName,
      }), ...current]);
      setScanStatus(`Ajouté : ${preference.name}`);
      return;
    }
    const scannedListId = activeListIdRef.current;
    const pendingItem = createShoppingItem(`Produit ${barcode}`, { barcode });
    updateItems((current) => [pendingItem, ...current]);
    pendingProductLookups.current.add(pendingItem.id);
    setScanStatus('Article ajouté · Recherche du nom…');

    try {
      const product = await getProduct(barcode);
      if (activeListIdRef.current !== scannedListId) return;
      updateItems((current) =>
        current.map((item) =>
          item.id === pendingItem.id && !item.deletedAt && item.name === pendingItem.name
            ? {
                ...item,
                name: normalizeItemName(truncateUtf8(normalizeItemName(product.product_name), 200)) || item.name,
                barcode,
                category: item.category === pendingItem.category
                  ? classifyProductLocally(product.product_name, product.categories, product.source).categoryName : item.category,
                updatedAt: nextItemTimestamp(item),
              }
            : item,
        ),
      );
      const added = itemsRef.current.find((item) => item.id === pendingItem.id && !item.deletedAt);
      if (added) setScanStatus(`Ajouté : ${added.name}`);
    } catch (error) {
      if (activeListIdRef.current !== scannedListId) return;
      const added = itemsRef.current.find((item) => item.id === pendingItem.id && !item.deletedAt && item.name === pendingItem.name);
      if (!added) return;
      setScanStatus(error instanceof BackendApiError && error.status === 404
        ? 'Article ajouté · Nom introuvable.'
        : 'Article ajouté · Nom indisponible pour le moment.');
      let suggestions: CommunitySuggestion[] = [];
      let communityAvailable = false;
      if (error instanceof BackendApiError && (error.status === 404 || error.status === 503)) {
        try {
          const community = await getCommunitySuggestions(barcode);
          suggestions = community.suggestions; communityAvailable = community.contributions_enabled === true;
        }
        catch { /* Community lookup is optional; private naming still works offline. */ }
      }
      if (activeListIdRef.current !== scannedListId
        || !itemsRef.current.some((item) => item.id === pendingItem.id && !item.deletedAt && item.name === pendingItem.name)) return;
      offerProductName(added.id, barcode, suggestions, communityAvailable);
    } finally {
      pendingProductLookups.current.delete(pendingItem.id);
    }
  }

  function offerProductName(id: string, barcode: string, suggestions: CommunitySuggestion[], communityAvailable = false) {
    const listId = activeListIdRef.current;
    setUnknownProducts((current) => current.some((product) => product.id === id)
      ? current : [...current, { id, barcode, listId, suggestions: suggestions.slice(0, 3), communityAvailable }]);
  }

  function dismissUnknownProduct() {
    if (unknownProduct) setUnknownProducts((current) => current.filter((product) => product.id !== unknownProduct.id));
  }

  const productNamePrompt = unknownProduct ? <UnknownProductPrompt key={unknownProduct.id} barcode={unknownProduct.barcode}
    suggestions={unknownProduct.suggestions} communityAvailable={unknownProduct.communityAvailable} onLater={dismissUnknownProduct} onSave={(name, category, participation) => {
      if (activeListIdRef.current !== unknownProduct.listId) { dismissUnknownProduct(); return; }
      renameItem(unknownProduct.id, name, category);
      dismissUnknownProduct();
      setScanStatus(`Ajouté : ${name}`);
      if (participation.publish) {
        const selected = unknownProduct.suggestions.filter((suggestion) => participation.proposalIds.includes(suggestion.proposal_id));
        const selectedFields = new Set(selected.map((suggestion) => suggestion.field));
        const proposal = {
          ...(!selectedFields.has('name') ? { name } : {}),
          ...(!selectedFields.has('category') && category !== 'À classer' ? { category } : {}),
        };
        const operations: Promise<unknown>[] = participation.proposalIds.map((id) => confirmCommunityProposal(id));
        if (proposal.name || proposal.category) operations.push(submitCommunityProposal(unknownProduct.barcode, proposal));
        void Promise.all(operations).then(() => {
          if (activeListIdRef.current === unknownProduct.listId) setScanStatus(`Ajouté : ${name} · Participation envoyée, validation non garantie.`);
        }).catch((error) => {
          if (activeListIdRef.current !== unknownProduct.listId) return;
          setScanStatus(error instanceof BackendApiError && error.status === 400
            ? `Ajouté : ${name} · Nom privé conservé, proposition publique non acceptée.`
            : `Ajouté : ${name} · Nom privé conservé, participation communautaire indisponible.`);
        });
      }
    }} /> : null;

  function renameItem(id: string, value: string, selectedCategory?: string) {
    const name = normalizeItemName(value);
    if (!name || truncateUtf8(name, 200) !== name) return;
    if (selectedCategory !== undefined && !STORE_CATEGORIES.some((category) => category.name === selectedCategory)) return;
    const ids = new Set(getEquivalentItems(itemsRef.current, id).map((item) => item.id));
    updateItems((current) => current.map((item) =>
      ids.has(item.id) && !item.deletedAt && (item.name !== name || (selectedCategory !== undefined && item.category !== selectedCategory))
        ? { ...item, name, category: selectedCategory ?? classifyProductLocally(name).categoryName, updatedAt: nextItemTimestamp(item) }
        : item,
    ));
    // Save only after the list write succeeds, for every barcode represented by the row.
    for (const item of itemsRef.current) {
      if (ids.has(item.id) && !item.deletedAt && item.barcode && item.name !== `Produit ${item.barcode}`) {
        saveProductPreference(item.barcode, { name: item.name, category: item.category });
      }
    }
  }

  function toggleItem(id: string) {
    updateItems((current) => {
      const group = getEquivalentItems(current, id);
      const ids = new Set(group.map((item) => item.id));
      const checked = !group.every((item) => item.checked);
      return current.map((item) => ids.has(item.id) && item.checked !== checked
        ? { ...item, checked, updatedAt: nextItemTimestamp(item) } : item);
    });
  }

  function increaseQuantity(id: string) {
    updateItems((current) => incrementGroup(current, id));
  }

  function decreaseQuantity(id: string) {
    updateItems((current) => decrementGroup(current, id));
  }

  function removeItem(id: string) {
    updateItems((current) => {
      const ids = new Set(getEquivalentItems(current, id).map((item) => item.id));
      return current.map((item) => {
        if (!ids.has(item.id)) return item;
        const updatedAt = nextItemTimestamp(item);
        return { ...item, deletedAt: updatedAt, updatedAt };
      });
    });
  }

  const syncCurrentList = useCallback((
    trigger: 'manual' | 'reconnect' | 'periodic' | 'pending' | 'foreground' | 'background' = 'manual',
    listId = activeListIdRef.current,
  ): Promise<boolean> => {
    if (serverMissing) return Promise.resolve(false);
    if (!ShoppingListStorage.isSyncEnabled(listId)) return Promise.resolve(false);
    const inFlight = syncInFlightRef.current;
    if (inFlight) {
      if (inFlight.listId === listId) return inFlight.promise;
      return inFlight.promise.then(() => syncCurrentList(trigger, listId));
    }
    const run = async (): Promise<boolean> => {
      const syncingListId = listId;
      const pendingChanges = ShoppingListStorage.getPendingChanges(listId);
      const pendingName = ShoppingListStorage.getPendingListName(listId);
      const pendingCount = pendingChanges.length + Number(!!pendingName);
      if (activeListIdRef.current === listId && trigger !== 'periodic') {
        setSyncPhase('syncing');
        setSyncStatus(
          trigger === 'reconnect'
            ? 'Connexion rétablie, reprise de la synchronisation…'
            : trigger === 'foreground'
            ? 'Actualisation de la liste à l’ouverture…'
            : pendingCount > 0
            ? `Synchronisation de ${pendingCount} changement(s)…`
            : 'Recherche de changements distants…',
        );
      }

      try {
        const result = await syncEngine.syncListIfOnline(
          listId,
          pendingChanges,
          ShoppingListStorage.getLastSyncTimestamp(listId),
          ...(pendingName ? [pendingName] as const : []),
        );

        if (!result.synced) {
          if (activeListIdRef.current !== syncingListId) return false;
          setSyncPhase(result.reason === 'offline' ? 'offline' : 'error');
          setSyncStatus(result.reason === 'offline' ? 'Hors ligne: sync reportée.' : 'Sync indisponible.');
          return false;
        }

        const mergedItems = ShoppingListStorage.completeSync(
          syncingListId, pendingChanges, result.remoteItems, result.response.server_time,
          pendingName, result.response.list_name,
        );
        if (!mergedItems) return false;
        setLists(ShoppingListStorage.getLists());
        if (activeListIdRef.current !== syncingListId) return true;

        showItems(mergedItems);
        setLastSyncAt(ShoppingListStorage.getLastSyncTimestamp(syncingListId));
        const remaining = ShoppingListStorage.getPendingChangesCount(syncingListId);
        setSyncPhase(remaining > 0 ? 'idle' : 'synced');
        setSyncStatus(
          remaining > 0
            ? `${remaining} modification(s) récente(s) conservée(s), en attente de synchronisation.`
            : result.response.conflicts.length > 0
            ? `${result.response.conflicts.length} conflit(s) résolu(s) en LWW.`
            : 'Liste synchronisée.',
        );
        return true;
      } catch (error) {
        if (error instanceof BackendApiError && error.status === 403) {
          ShoppingListStorage.disableSync(syncingListId);
          setLists(ShoppingListStorage.getLists());
          if (activeListIdRef.current === syncingListId) {
            setSyncPhase('disconnected');
            setSyncStatus(null);
          }
          return false;
        }
        if (activeListIdRef.current !== syncingListId) return false;
        setSyncPhase('error');
        const reference = error instanceof BackendApiError ? ` Référence : ${error.requestId}.` : '';
        setSyncStatus(`Erreur sync: changements conservés en local.${reference}`);
        return false;
      }
    };
    const promise = run().finally(() => { syncInFlightRef.current = null; });
    syncInFlightRef.current = { listId, promise };
    return promise;
  }, [syncEngine, serverMissing]);

  const pendingSync = useMemo(() => new DebouncedListSync({
    hasPending: (listId) => ShoppingListStorage.getLists().some((list) => list.id === listId)
      && !serverMissing && ShoppingListStorage.isSyncEnabled(listId)
      && ShoppingListStorage.getPendingChangesCount(listId) > 0,
    waitForIdle: async () => {
      await backgroundSyncRef.current;
      while (syncInFlightRef.current) await syncInFlightRef.current.promise;
    },
    sync: (listId) => syncCurrentList('pending', listId),
  }), [syncCurrentList]);

  useEffect(() => {
    let wasForeground = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
    let cancelled = false;
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      const leaving = wasForeground && (state === 'inactive' || state === 'background');
      wasForeground = active;
      setForeground(active);
      if (!leaving) return;
      // Stop the debounce immediately, before React processes the lifecycle update.
      pendingSync.setEnabled(false);
      if (backgroundSyncRef.current) return;
      const flush = async () => {
        const activeId = activeListIdRef.current;
        const listIds = ShoppingListStorage.getLists().map((list) => list.id)
          .sort((a, b) => Number(b === activeId) - Number(a === activeId));
        for (const listId of listIds) {
          // An earlier request may have acknowledged only the pre-edit snapshot.
          while (syncInFlightRef.current) await syncInFlightRef.current.promise;
          if (cancelled) return;
          if (!ShoppingListStorage.getLists().some((list) => list.id === listId)
            || !ShoppingListStorage.getPendingChangesCount(listId)) continue;
          await syncCurrentList('background', listId);
        }
      };
      // Best effort only: the OS can suspend JS. SQLite remains the durable queue.
      backgroundSyncRef.current = flush().catch(() => {}).finally(() => { backgroundSyncRef.current = null; });
    });
    return () => { cancelled = true; subscription.remove(); };
  }, [pendingSync, syncCurrentList]);

  useEffect(() => {
    // Fetch remote changes even when this device has nothing to send.
    // Repeated active events leave `foreground` unchanged; in-flight syncs are reused.
    if (foreground) void syncCurrentList('foreground');
  }, [foreground, syncCurrentList]);

  useEffect(() => {
    // A cached network event can be stale. Like manual sync, the engine checks
    // current native connectivity before making any HTTP request.
    if (foreground) {
      for (const list of ShoppingListStorage.getLists()) {
        if (ShoppingListStorage.getPendingChangesCount(list.id)) pendingSync.schedule(list.id);
      }
    }
    pendingSync.setEnabled(foreground && !serverMissing);
    return () => pendingSync.setEnabled(false);
  }, [foreground, pendingSync, serverMissing]);

  useEffect(() => {
    const online = networkState.isConnected === true && networkState.isInternetReachable !== false;
    if (!online || !foreground) return;
    for (const list of ShoppingListStorage.getLists()) {
      if (ShoppingListStorage.getPendingChangesCount(list.id) && !pendingSync.hasScheduled(list.id)) {
        pendingSync.schedule(list.id);
      }
    }
  }, [foreground, networkState.isConnected, networkState.isInternetReachable, pendingSync]);

  useEffect(() => () => pendingSync.clear(), [pendingSync]);

  useEffect(() => {
    if (networkState.isConnected === undefined) return;

    const online = networkState.isConnected === true && networkState.isInternetReachable !== false;
    const wasOnline = previousOnlineRef.current;
    previousOnlineRef.current = online;

    if (wasOnline === false && online && foreground && !ShoppingListStorage.getPendingChangesCount(activeListIdRef.current)) {
      void syncCurrentList('reconnect');
    }
  }, [foreground, networkState.isConnected, networkState.isInternetReachable, syncCurrentList]);

  useEffect(() => {
    const online = networkState.isConnected === true && networkState.isInternetReachable !== false;
    if (!online || !foreground || serverMissing || syncEnabledListIds === '[]') return undefined;
    if (listOpen && !ShoppingListStorage.isSyncEnabled(activeListId)) return undefined;
    let directoryCursor = 0;
    let cancelled = false;
    const stop = startRemoteRefresh(async () => {
      if (cancelled || AppState.currentState !== 'active' || syncInFlightRef.current || backgroundSyncRef.current) return null;
      const ids = (listOpen ? [activeListIdRef.current] : ShoppingListStorage.getLists().map((list) => list.id).sort())
        .filter((id) => ShoppingListStorage.isSyncEnabled(id));
      // Refresh names on the home page too. Bound each round to avoid a burst
      // when someone has imported a large backup with many lists.
      let refreshed = false;
      const start = directoryCursor;
      for (let offset = 0; offset < Math.min(3, ids.length); offset += 1) {
        const id = ids[(start + offset) % ids.length];
        if (cancelled || AppState.currentState !== 'active' || syncInFlightRef.current || backgroundSyncRef.current) return null;
        // Advance even on failure so a revoked list cannot starve the others.
        directoryCursor = (start + offset + 1) % ids.length;
        if (!ShoppingListStorage.isSyncEnabled(id) || pendingSync.hasScheduled(id) || !ShoppingListStorage.getLists().some((list) => list.id === id)) continue;
        refreshed = true;
        if (!await syncCurrentList('periodic', id)) return false;
      }
      return refreshed ? true : null;
    });
    return () => { cancelled = true; stop(); };
  }, [foreground, activeListId, listOpen, networkState.isConnected, networkState.isInternetReachable, syncCurrentList, pendingSync, serverMissing, syncEnabledListIds]);

  function resetList() {
    showItems(ShoppingListStorage.clearCurrentList(activeListId));
    pendingSync.schedule(activeListId);
  }

  function selectList(listId: string) {
    setListOpen(true);
    setPanel(null); setInvitationCode(undefined); setInputValue(''); setQuantity('1'); setAddedMessage(null); setCheckedExpanded(false);
    ShoppingListStorage.setActiveList(listId);
    activeListIdRef.current = listId;
    setActiveListId(listId);
    setCategoryOrder(ShoppingListStorage.getCategoryOrder(listId));
    setOrderingListId(null);
    showItems(ShoppingListStorage.getCurrentList(listId));
    setLastSyncAt(ShoppingListStorage.getLastSyncTimestamp(listId));
    setSyncPhase('idle');
    setSyncStatus(null);
    setScanStatus(null);
    setInputError(null);
    setScannerVisible(false);
  }

  function createList(name: string) {
    const created = ShoppingListStorage.createList(name);
    setLists(ShoppingListStorage.getLists());
    selectList(created.id);
    pendingSync.schedule(created.id);
  }

  function renameList(listId: string, name: string) {
    ShoppingListStorage.renameList(listId, name);
    setLists(ShoppingListStorage.getLists());
    pendingSync.schedule(listId);
  }

  function archiveList(listId: string) {
    const nextId = ShoppingListStorage.archiveList(listId);
    setLists(ShoppingListStorage.getLists());
    if (listId === activeListId) selectList(nextId);
    setListOpen(false); setPanel(null);
  }

  async function joinSharedList(listId: string) {
    ShoppingListStorage.importSharedList(listId);
    setLists(ShoppingListStorage.getLists());
    selectList(listId);
    await syncCurrentList('manual', listId);
  }

  function openShare(listId: string) {
    if (ShoppingListStorage.isSyncDisabled(listId)) return;
    setSharingListId(listId);
    setPanel('share');
  }

  async function prepareSharing(listId: string) {
    if (serverMissing || ShoppingListStorage.isSyncDisabled(listId)) return false;
    // Opening the panel alone must not publish a personal list. This callback
    // runs only after the user explicitly requests an invitation code.
    ShoppingListStorage.enableSyncForSharing(listId);
    setLists(ShoppingListStorage.getLists());
    return syncCurrentList('manual', listId);
  }

  function deleteSharedListLocally(listId: string) {
    const selectedId = activeListIdRef.current;
    const nextId = ShoppingListStorage.deleteListPermanently(listId);
    setLists(ShoppingListStorage.getLists());
    if (selectedId === listId) {
      const wasOpen = listOpen;
      selectList(nextId);
      setListOpen(wasOpen);
    } else {
      ShoppingListStorage.setActiveList(selectedId);
      setPanel(null);
    }
    setSharingListId(null);
  }

  const activeName = lists.find((list) => list.id === activeListId)?.name ?? 'Ma liste';
  const checkedItems = sortItemsForDisplay(visibleItems.filter((item) => item.checked));
  const offline = networkState.isConnected === false || networkState.isInternetReachable === false;
  const syncDisabled = ShoppingListStorage.isSyncDisabled(activeListId);
  const syncEnabled = ShoppingListStorage.isSyncEnabled(activeListId);
  // A revoked share still needs an explanation; a purely local list does not.
  const showSync = !serverMissing && (syncEnabled || syncDisabled);
  const statusLabel = serverMissing ? 'Mode local · Serveur à configurer' : syncDisabled ? 'Synchronisation coupée' : syncPhase === 'syncing' ? 'Envoi en cours…'
    : offline || syncPhase === 'offline' ? `Hors ligne${pendingChangesCount ? ` · ${pendingChangesCount} en attente` : ''}`
    : syncPhase === 'error' ? 'Envoi interrompu · Réessayer'
    : pendingChangesCount ? `${pendingChangesCount} changement${pendingChangesCount > 1 ? 's' : ''} en attente`
    : syncPhase === 'synced' || lastSyncAt > 0 ? 'À jour' : 'Connexion en cours…';
  const rowCallbacks = { onDecreaseQuantity: decreaseQuantity, onIncreaseQuantity: increaseQuantity,
    getItemBarcodes: (id: string) => [...new Set(getEquivalentItems(itemsRef.current, id)
      .map((item) => item.barcode).filter((barcode): barcode is string => !!barcode && /^[0-9]{8,14}$/.test(barcode)))],
    onRenameItem: renameItem, onRemoveItem: removeItem, onToggleItem: toggleItem };
  const closePanel = () => { Keyboard.dismiss(); setPanel(null); };
  const openAdd = () => { setAddedMessage(null); setInputError(null); setPanel('add'); };
  const surface = { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: theme.stroke, borderRadius: theme.radius, padding: 16, gap: 12 };
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {!listOpen ? <ScrollView testID="lists-home" keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: 8, gap: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: theme.muted, fontSize: 14 }}>SmartShopping</Text>
            <Heading accessibilityRole="header">Mes listes</Heading>
          </View>
          <Pressable accessibilityLabel="Réglages" onPress={() => setPanel('settings')} style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 26 }}>⚙</Text>
          </Pressable>
        </View>
        {serverMissing ? <View style={surface}><Text>Tes listes fonctionnent sur cet appareil. Configure le serveur de test dans Réglages pour les partager et les synchroniser.</Text><Button variant="secondary" label="Configurer le serveur" onPress={() => setPanel('settings')} /></View> : null}
        <ListManager activeListId={activeListId} lists={lists} onArchive={archiveList} onCreate={createList} onRename={renameList} onSelect={selectList} onShare={openShare} />
        <Button variant="secondary" label="Rejoindre une liste" onPress={() => { setInvitationCode(undefined); setPanel('join'); }} />
        <View style={{ flex: 1, minHeight: 24 }} />
        <AppFooter />
      </ScrollView> : <>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 24 }}>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={() => { setListOpen(false); closePanel(); }}><Text style={{ color: theme.muted }}>← Mes listes</Text></Pressable>
            <Pressable accessibilityLabel="Réglages" onPress={() => setPanel('settings')} style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 26 }}>⚙</Text>
            </Pressable>
          </View>
          <Heading accessibilityRole="header">{activeName}</Heading>
          {showSync ? <Pressable accessibilityLabel="État de synchronisation" onPress={() => setPanel('sync')}>
            <Text accessibilityLiveRegion="polite" style={{ color: !syncDisabled && syncPhase === 'error' ? theme.danger : theme.muted, fontSize: 14 }}>
              {syncDisabled ? '' : syncPhase === 'synced' && !pendingChangesCount && !offline ? '✓ ' : '↻ '}{statusLabel}
            </Text>
          </Pressable> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button variant="secondary" label="Partager" disabled={syncDisabled} onPress={() => openShare(activeListId)} style={{ flexGrow: 1 }} />
            <Button variant="secondary" label="Trier" accessibilityLabel="Trier les rayons" onPress={() => setOrderingListId(activeListIdRef.current)} style={{ flexGrow: 1 }} />
            <Button variant="ghost" label="•••" accessibilityLabel="Options de la liste" onPress={() => setPanel('options')} />
          </View>
        </View>
        {scanStatus ? <Pressable accessibilityLabel="Masquer le résultat du scan" onPress={() => setScanStatus(null)} style={surface}>
          <Text accessibilityLiveRegion="polite">{scanStatus}</Text><Text style={{ color: theme.muted, fontSize: 13 }}>Toucher pour masquer</Text>
        </Pressable> : null}
        <Text style={{ color: theme.muted, fontWeight: '600' }}>{remainingCount} article{remainingCount > 1 ? 's' : ''} restant{remainingCount > 1 ? 's' : ''}</Text>
        {remainingCount === 0 ? <View style={{ alignItems: 'center', paddingVertical: 36, gap: 12 }}>
          <BasketIllustration complete={checkedItems.length > 0} />
          <Heading style={{ fontSize: 24, textAlign: 'center' }}>{checkedItems.length ? 'Tout est dans le panier' : 'Ta liste est vide'}</Heading>
          <Text style={{ color: theme.muted, textAlign: 'center', maxWidth: 280 }}>{checkedItems.length ? 'Tes articles restent ici pour les prochaines courses.' : 'Un mot, un code-barres ou une photo : à toi de choisir.'}</Text>
        </View> : null}
        {sections.map((section) => <CategorySection key={section.categoryName} {...rowCallbacks} section={section} />)}
        {checkedItems.length ? <View style={{ gap: 12 }}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: checkedExpanded }} onPress={() => setCheckedExpanded((value) => !value)}>
            <Text style={{ fontWeight: '700', color: theme.muted }}>{checkedExpanded ? '⌃' : '⌄'} Déjà pris · {checkedItems.length}</Text>
          </Pressable>
          {checkedExpanded ? <CategorySection {...rowCallbacks} section={{ categoryName: 'Dans le panier', orderIndex: 0, items: checkedItems }} /> : null}
        </View> : null}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, backgroundColor: theme.bg, borderTopWidth: 1, borderColor: theme.border }}>
        <Button label="＋ Ajouter" accessibilityLabel="Ajouter un article" onPress={openAdd} />
      </View>

      </>}
      {panel === 'add' ? <PageModal title="Ajouter un article" onClose={closePanel}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button variant="secondary" label="Saisir" accessibilityState={{ selected: true }} onPress={() => inputRef.current?.focus()} style={{ flexGrow: 1 }} />
          <Button variant="ghost" label="Code-barres" accessibilityLabel="Scanner un code-barres" onPress={() => { closePanel(); setScannerVisible(true); }} style={{ flexGrow: 1 }} />
          <Button variant="ghost" label="Liste écrite" accessibilityLabel="Scanner une liste écrite" onPress={() => { closePanel(); setOcrListId(activeListIdRef.current); }} style={{ flexGrow: 1 }} />
        </View>
        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.muted, fontWeight: '700' }}>SAISIR</Text>
          <TextInput ref={inputRef} autoFocus accessibilityLabel="Nom du produit" blurOnSubmit={false}
            onChangeText={(value) => { setInputValue(value); setInputError(null); setAddedMessage(null); }}
            onSubmitEditing={addItem} placeholder="Ex. pain, pommes, café…" returnKeyType="done" testID="add-item-input" value={inputValue} />
        </View>
        <View style={{ gap: 8 }}><Text style={{ fontWeight: '600' }}>Quantité</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Button variant="secondary" label="−" accessibilityLabel="Diminuer la quantité à ajouter" disabled={Number(quantity) <= 1}
              onPress={() => setQuantity(String(Math.max(1, (Number(quantity) || 1) - 1)))} />
            <TextInput accessibilityLabel="Quantité à ajouter" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" maxLength={3}
              selectTextOnFocus style={{ flex: 1, textAlign: 'center' }} />
            <Button variant="secondary" label="+" accessibilityLabel="Augmenter la quantité à ajouter" disabled={Number(quantity) >= 999}
              onPress={() => setQuantity(String(Math.min(999, (Number(quantity) || 0) + 1)))} />
          </View>
        </View>
        {inputValue.trim() ? <View style={surface}><Text style={{ color: theme.muted, fontSize: 14 }}>Rayon détecté</Text>
          <Text style={{ fontWeight: '600' }}>{classifyProductLocally(inputValue).categoryName}</Text></View> : null}
        {inputError ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{inputError}</Text> : null}
        {addedMessage ? <Text accessibilityLiveRegion="polite" style={{ color: theme.success }}>✓ {addedMessage}</Text> : null}
        <Button label="Ajouter à la liste" testID="add-item-button" disabled={!inputValue.trim()} onPress={addItem} />
        <Button variant="ghost" label="Terminer" onPress={closePanel} />

      </PageModal> : null}
      {panel === 'share' && sharingListId ? <PageModal title="Partager une liste" onClose={closePanel}>
        <Text style={{ color: theme.muted }}>{lists.find((list) => list.id === sharingListId)?.name}</Text>
        {ShoppingListStorage.isSyncDisabled(sharingListId) ? <Text style={{ color: theme.muted }}>Synchronisation coupée. Cette copie reste disponible sur cet appareil. Pour rétablir le partage, rejoins cette liste avec une nouvelle invitation.</Text> : <ShareListCard session={invitationSession} onBeforeInvite={() => prepareSharing(sharingListId)}
          listId={sharingListId} onDeleted={() => deleteSharedListLocally(sharingListId)} />}
      </PageModal> : null}
      {panel === 'join' ? <PageModal title="Rejoindre une liste" onClose={() => { setInvitationCode(undefined); closePanel(); }}>
        <JoinListCard key={invitationCode ?? 'manual'} initialCode={invitationCode} onJoined={joinSharedList} />
      </PageModal> : null}
      {panel === 'settings' ? <PageModal title="Réglages" onClose={closePanel}>
        <TestServerCard />
        <AppearancePicker />
        <Button variant="secondary" label="Sauvegarde et restauration" onPress={() => setPanel('backup')} />
        {showSync ? <Button variant="secondary" label="Synchronisation" onPress={() => setPanel('sync')} /> : null}
        <DeviceDiagnosticsCard />
        <Text style={{ color: theme.muted, textAlign: 'center', fontSize: 13 }}>SmartShopping · Tes courses, à ton rythme.</Text>
      </PageModal> : null}
      {panel === 'sync' && showSync ? <PageModal title="Synchronisation" onClose={closePanel}>
        {serverMissing ? <TestServerCard /> : <SyncStatusCard lastSyncAt={lastSyncAt} message={syncStatus} networkState={networkState}
          onSync={() => void syncCurrentList('manual')} pendingCount={pendingChangesCount} phase={syncDisabled ? 'disconnected' : syncPhase} />}
      </PageModal> : null}
      {panel === 'backup' ? <PageModal title="Sauvegarde et restauration" onClose={() => setPanel('settings')}>
        <BackupPanel onRestored={(ids) => {
          setLists(ShoppingListStorage.getLists());
          if (ids[0]) selectList(ids[0]);
          for (const id of ids) pendingSync.schedule(id);
        }} />
      </PageModal> : null}
      {panel === 'options' ? <PageModal title="Options de la liste" onClose={closePanel}>
        <ListActions key={activeListId} list={{ id: activeListId, name: activeName }} canDelete={lists.length > 1}
          shareDisabled={syncDisabled} onShare={openShare} onRename={renameList} onDelete={archiveList} />
        <Button variant="danger" label="Vider la liste" onPress={() => Alert.alert('Vider la liste ?',
          !syncEnabled ? 'Tous les articles de cette copie locale seront retirés de cet appareil.' : 'Tous les articles seront retirés, y compris pour les personnes avec qui tu partages cette liste.', [
            { text: 'Annuler', style: 'cancel' }, { text: 'Vider', style: 'destructive', onPress: () => { resetList(); closePanel(); } },
          ])} />
      </PageModal> : null}
      {orderingListId ? <Modal visible animationType="none" presentationStyle="fullScreen" testID="category-order-modal" onRequestClose={() => setOrderingListId(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
          <CategoryOrderPanel order={categoryOrder} onCancel={() => setOrderingListId(null)} onSave={(next) => {
            if (activeListIdRef.current !== orderingListId) throw new Error('La liste a changé.');
            ShoppingListStorage.saveCategoryOrder(orderingListId, next); setCategoryOrder(next); setOrderingListId(null);
          }} />
        </SafeAreaView>
      </Modal> : null}
      {ocrListId ? <Modal visible animationType="none" presentationStyle="fullScreen" testID="ocr-modal" onRequestClose={() => setOcrListId(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}><OcrImportPanel onCancel={() => setOcrListId(null)} onImport={importRecognizedItems} /></SafeAreaView>
      </Modal> : null}
      {scannerVisible ? <Modal visible animationType="none" presentationStyle="fullScreen" testID="scanner-modal" onRequestClose={() => setScannerVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}><BarcodeScannerPanel paused={!!unknownProduct} onCancel={() => setScannerVisible(false)} onScanned={addItemFromBarcode} statusMessage={scanStatus} />{productNamePrompt}</SafeAreaView>
      </Modal> : null}
      {!scannerVisible ? productNamePrompt : null}
    </View>
  );
}

function nextItemTimestamp(item: ShoppingItem): number {
  return Math.max(Date.now(), item.updatedAt + 1);
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
