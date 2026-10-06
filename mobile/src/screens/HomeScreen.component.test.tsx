import React from 'react';
import { Alert, AppState, BackHandler, Linking, type AppStateStatus } from 'react-native';
import { act, fireEvent, render as renderNative } from '@testing-library/react-native';
import { HomeScreen } from './HomeScreen';
import { BackendApiError, confirmCommunityProposal, getCommunitySuggestions, getProduct, submitCommunityProposal } from '@/services/api/backend';
import { ShoppingListStorage as Storage } from '@/services/storage/shoppingListStorage';
import { getProductPreference } from '@/services/storage/productPreferences';
import type { ShoppingItem } from '@/types';

let mockActiveList = 'home';
let mockTestServerEnabled = false;
let mockDisabledLists = new Set<string>();
let mockCategoryOrders = new Map<string, string[]>();
let mockItems = new Map<string, ShoppingItem[]>();
const mockPreferencesDisk = new Map<string, string>();
jest.mock('@/services/storage/localKeyValueStorage', () => ({ LocalKeyValueStorage: {
  getString: (key: string) => mockPreferencesDisk.get(key) ?? null,
  setString: (key: string, value: string) => { mockPreferencesDisk.set(key, value); },
  delete: (key: string) => { mockPreferencesDisk.delete(key); },
} }));
const mockSync = jest.fn();
const mockEngine = { syncListIfOnline: mockSync };
const mockNetwork = { isConnected: true, isInternetReachable: true };

jest.mock('@/services/storage/shoppingListStorage', () => ({
  ShoppingListStorage: {
    isSyncDisabled: (id: string) => mockDisabledLists.has(id),
    disableSync: (id: string) => { mockDisabledLists.add(id); },
    importSharedList: (id: string) => { mockDisabledLists.delete(id); if (!mockItems.has(id)) mockItems.set(id, []); },
    getLists: () => ['home', 'other'].map((id) => ({ id, syncDisabled: mockDisabledLists.has(id), name: id, createdAt: 1, updatedAt: 1 })),
    getActiveListId: () => mockActiveList,
    createList: jest.fn((name: string) => ({ id: 'created', name, createdAt: 1, updatedAt: 1 })),
    renameList: jest.fn(),
    deleteListPermanently: jest.fn((id: string) => { mockItems.delete(id); mockActiveList = 'replacement'; return mockActiveList; }),
    archiveList: jest.fn((id: string) => { if (id === mockActiveList) mockActiveList = id === 'home' ? 'other' : 'home'; return mockActiveList; }),
    setActiveList: (id: string) => { mockActiveList = id; },
    getCurrentList: (id: string) => mockItems.get(id)?.map((item) => ({ ...item })) ?? [],
    getPendingChanges: (id: string) => mockItems.get(id)?.filter((item) => item.syncedAt === undefined).map((item) => ({ ...item })) ?? [],
    getPendingListName: jest.fn(() => undefined),
    getPendingChangesCount: (id: string) => mockDisabledLists.has(id) ? 0 : (mockItems.get(id)?.filter((item) => item.syncedAt === undefined).length ?? 0) + Number(!!require('@/services/storage/shoppingListStorage').ShoppingListStorage.getPendingListName(id)),
    getLastSyncTimestamp: () => 0,
    getCategoryOrder: (id: string) => mockCategoryOrders.get(id) ?? [],
    saveCategoryOrder: jest.fn((id: string, order: string[]) => { mockCategoryOrders.set(id, order); }),
    saveCurrentList: jest.fn((id: string, items: ShoppingItem[]) => { mockItems.set(id, items.map((item) => ({ ...item }))); }),
    completeSync: jest.fn((id: string) => mockItems.get(id)?.map((item) => ({ ...item })) ?? null),
  },
}));
jest.mock('@/services/api/testServer', () => ({ canConfigureTestServer: () => mockTestServerEnabled, getTestServerUrl: () => null, verifyAndSaveTestServer: jest.fn() }));
jest.mock('@/hooks/useOfflineSync', () => ({ useOfflineSync: () => ({ networkState: mockNetwork, syncEngine: mockEngine }) }));
jest.mock('@/services/api/backend', () => ({
  BackendApiError: class extends Error { status: number; requestId: string; constructor(message: string, status: number, requestId: string) { super(message); this.status = status; this.requestId = requestId; } },
  getProduct: jest.fn(), getCommunitySuggestions: jest.fn(), submitCommunityProposal: jest.fn(), confirmCommunityProposal: jest.fn(),
  getConfiguredApiBaseUrl: () => 'fixture',
}));
jest.mock('@/components/BarcodeScannerPanel', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return { BarcodeScannerPanel: ({ onScanned }: { onScanned: (barcode: string) => void }) => (
    <Pressable onPress={() => onScanned('3017620422003')}><Text>Simuler scan</Text></Pressable>
  ) };
});
jest.mock('@/components/OcrImportPanel', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return { OcrImportPanel: ({ onImport }: { onImport: (items: unknown[]) => void }) =>
    <Pressable onPress={() => onImport([{ name: 'lait', quantity: 2 }, { name: 'Pain', quantity: 1 }])}>
      <Text>Valider OCR test</Text>
    </Pressable> };
});
jest.mock('@/components/DeviceDiagnosticsCard', () => ({ DeviceDiagnosticsCard: () => null }));
jest.mock('@/services/backup/backupFiles', () => ({ exportBackupFile: jest.fn(), importBackupFile: jest.fn(), saveBackupOnDevice: jest.fn() }));
jest.mock('@/components/JoinListCard', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return { JoinListCard: ({ onJoined, initialCode }: { onJoined: (id: string) => Promise<void>; initialCode?: string }) => (
    <><Text>{initialCode}</Text><Pressable onPress={() => void onJoined('other')}><Text>Rejoindre liste test</Text></Pressable></>
  ) };
});
jest.mock('@/components/ShareListCard', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return { ShareListCard: ({ listId, onBeforeInvite, onDeleted }: { listId: string; onBeforeInvite: () => Promise<boolean>; onDeleted: () => void }) => <>
    <Text>{`Partage cible : ${listId}`}</Text>
    <Pressable onPress={() => void onBeforeInvite()}><Text>Préparer partage test</Text></Pressable>
    <Pressable onPress={onDeleted}><Text>Suppression serveur test</Text></Pressable>
  </> };
});
jest.mock('@/components/ListManager', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return { ListManager: ({ onSelect, onArchive, onRename, onCreate, onShare }: { onShare: (id: string) => void; onCreate: (name: string) => void; onSelect: (id: string) => void; onArchive: (id: string) => void; onRename: (id: string, name: string) => void }) => (
    <><Pressable onPress={() => onSelect(mockActiveList)}><Text>Ouvrir liste active test</Text></Pressable><Pressable onPress={() => onCreate('Vacances')}><Text>Créer liste nommée test</Text></Pressable><Pressable onPress={() => onSelect('other')}><Text>Choisir autre liste</Text></Pressable>
    <Pressable onPress={() => onArchive('other')}><Text>Supprimer autre liste test</Text></Pressable>
    <Pressable onPress={() => onArchive('home')}><Text>Supprimer liste ouverte test</Text></Pressable>
    <Pressable onPress={() => onShare('other')}><Text>Partager autre liste test</Text></Pressable>
    <Pressable onPress={() => onRename('other', 'Vacances')}><Text>Renommer autre liste test</Text></Pressable></>
  ) };
});
jest.mock('@/components/CategorySection', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return { CategorySection: ({ section, onIncreaseQuantity, onDecreaseQuantity, onToggleItem, onRemoveItem, onRenameItem }: {
    section: { categoryName: string; items: ShoppingItem[] }; onIncreaseQuantity: (id: string) => void;
    onRenameItem: (id: string, name: string, category?: string) => void;
    onDecreaseQuantity: (id: string) => void; onToggleItem: (id: string) => void; onRemoveItem: (id: string) => void;
  }) => <View testID={`section-${section.categoryName}`}>{section.items.map((item) => <View key={item.id}>
    <Pressable testID={`decrease-${item.id}`} onPress={() => onDecreaseQuantity(item.id)}><Text>Diminuer</Text></Pressable>
    <Pressable testID={`toggle-${item.id}`} onPress={() => onToggleItem(item.id)}><Text>Cocher</Text></Pressable>
    <Pressable testID={`remove-${item.id}`} onPress={() => onRemoveItem(item.id)}><Text>Supprimer</Text></Pressable>
    <Pressable testID={`category-${item.id}`} onPress={() => onRenameItem(item.id, item.name, 'Épicerie salée')}><Text>Choisir rayon test</Text></Pressable>
    <Pressable testID={`rename-${item.id}`} onPress={() => onRenameItem(item.id, 'Pain')}><Text>Renommer article</Text></Pressable>
    <Text testID={`quantity-${item.id}`}>{String(item.quantity)}</Text>
    <Pressable testID={`increase-${item.id}`} onPress={() => onIncreaseQuantity(item.id)}><Text>Augmenter</Text></Pressable>
  </View>)}</View> };
});

// Existing shopping journeys explicitly open the saved list from the new home screen.
function render(ui: React.ReactElement) {
  const screen = renderNative(ui);
  fireEvent.press(screen.getByText('Ouvrir liste active test'));
  return screen;
}

const milk = (listId = 'home'): ShoppingItem => ({ id: listId, listId, name: 'Lait', quantity: 1, checked: false, updatedAt: 1 });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const success = { synced: true, response: { server_time: 1000, conflicts: [] }, remoteItems: [] };
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getCommunitySuggestions).mockReset().mockResolvedValue({ barcode: '3017620422003', suggestions: [], contributions_enabled: true });
  jest.mocked(submitCommunityProposal).mockReset().mockResolvedValue({ proposal_ids: [], publication_status: 'received' });
  jest.mocked(confirmCommunityProposal).mockReset().mockResolvedValue();
  mockPreferencesDisk.clear();
  mockTestServerEnabled = false;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  jest.spyOn(Linking, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }) as unknown as ReturnType<typeof Linking.addEventListener>);
  mockSync.mockReset().mockResolvedValue(success);
  jest.mocked(Storage.getPendingListName).mockReset().mockReturnValue(undefined);
  mockActiveList = 'home';
  mockDisabledLists = new Set();
  mockCategoryOrders = new Map();
  mockItems = new Map([['home', [milk()]], ['other', [milk('other')]]]);
});

describe('HomeScreen during synchronization', () => {
  it('persists edits immediately and acknowledges only the original snapshot', async () => {
    const request = deferred<typeof success>();
    mockSync.mockReturnValue(request.promise);
    const screen = render(<HomeScreen />);
    // The opening synchronization is already in flight.
    fireEvent.press(screen.getByTestId('increase-home'));
    expect(Storage.saveCurrentList).toHaveBeenCalled();
    expect(mockItems.get('home')?.[0].quantity).toBe(2);
    await act(async () => request.resolve(success));
    expect(Storage.completeSync).toHaveBeenCalledWith('home', expect.arrayContaining([expect.objectContaining({ quantity: 1 })]), [], 1000, undefined, undefined);
    expect(screen.getByTestId('quantity-home').props.children).toBe('2');
    fireEvent.press(screen.getByLabelText('État de synchronisation'));
    screen.getByText('1 modification(s) récente(s) conservée(s), en attente de synchronisation.');
  });
  it('does not replace the visible list when another list finishes syncing', async () => {
    const request = deferred<typeof success>();
    mockSync.mockReturnValue(request.promise);
    const screen = render(<HomeScreen />);
    // The opening synchronization is already in flight.
    fireEvent.press(screen.getByText('← Mes listes'));
    fireEvent.press(screen.getByText('Choisir autre liste'));
    await act(async () => request.resolve(success));
    expect(Storage.completeSync).toHaveBeenCalledWith('home', expect.any(Array), [], 1000, undefined, undefined);
    expect(screen.queryByTestId('quantity-home')).toBeNull();
    expect(screen.getByTestId('quantity-other').props.children).toBe('1');
  });
  it('keeps local edits after a network failure', async () => {
    const request = deferred<typeof success>();
    mockSync.mockReturnValue(request.promise);
    const screen = render(<HomeScreen />);
    // The opening synchronization is already in flight.
    fireEvent.press(screen.getByTestId('increase-home'));
    await act(async () => request.reject(new Error('offline')));
    expect(Storage.completeSync).not.toHaveBeenCalled();
    expect(screen.getByTestId('quantity-home').props.children).toBe('2');
    fireEvent.press(screen.getByLabelText('État de synchronisation'));
    screen.getByText('Erreur sync: changements conservés en local.');
  });
  it('keeps a local edit newer than the item when the clock moves backwards', () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(0);
    try {
      const screen = render(<HomeScreen />);
      fireEvent.press(screen.getByTestId('increase-home'));
      expect(mockItems.get('home')?.[0].updatedAt).toBe(2);
    } finally {
      clock.mockRestore();
    }
  });
  it('does not add demo items to an empty persisted list', () => {
    mockItems.set('home', []);
    const screen = render(<HomeScreen />);
    screen.getByText('0 article restant');
    expect(Storage.saveCurrentList).not.toHaveBeenCalled();
    expect(mockItems.get('home')).toEqual([]);
  });
  it('does not display an old offline response after switching lists', async () => {
    const request = deferred<{ synced: boolean; reason: string }>();
    mockSync.mockReturnValue(request.promise);
    const screen = render(<HomeScreen />);
    // The opening synchronization is already in flight.
    fireEvent.press(screen.getByText('← Mes listes'));
    fireEvent.press(screen.getByText('Choisir autre liste'));
    await act(async () => request.resolve({ synced: false, reason: 'offline' }));
    expect(screen.queryByText('Hors ligne: sync reportée.')).toBeNull();
  });
});

describe('basic item input', () => {
  it('adds a trimmed item and queues it immediately', () => {
    const screen = render(<HomeScreen />);
    fireEvent.press(screen.getByLabelText('Ajouter un article'));
    fireEvent.changeText(screen.getByTestId('add-item-input'), '  Pain  ');
    fireEvent.press(screen.getByTestId('add-item-button'));
    expect(mockItems.get('home')).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Pain', quantity: 1, checked: false, category: 'Boulangerie' })]));
    expect(screen.getByTestId('add-item-input').props.value).toBe('');
  });
  it('rejects names exceeding the server byte limit, including accented text', () => {
    const screen = render(<HomeScreen />);
    fireEvent.press(screen.getByLabelText('Ajouter un article'));
    fireEvent.changeText(screen.getByTestId('add-item-input'), 'é'.repeat(101));
    fireEvent.press(screen.getByTestId('add-item-button'));
    expect(Storage.saveCurrentList).not.toHaveBeenCalled();
    screen.getByText('Ce nom est trop long. Raccourcis-le avant de l’ajouter.');
    fireEvent.changeText(screen.getByTestId('add-item-input'), 'é'.repeat(100));
    fireEvent.press(screen.getByTestId('add-item-button'));
    expect(mockItems.get('home')).toHaveLength(2);
  });
  it('does not increase quantities past the server limit', () => {
    mockItems.set('home', [{ ...milk(), quantity: 999 }]);
    const screen = render(<HomeScreen />);
    fireEvent.press(screen.getByTestId('increase-home'));
    expect(mockItems.get('home')?.[0].quantity).toBe(999);
    expect(mockItems.get('home')?.[0].updatedAt).toBe(1);
  });
});


describe('basic shopping journeys', () => {
  it('checks, adjusts and deletes an item while preserving a queued tombstone', () => {
    const screen = render(<HomeScreen />);
    fireEvent.press(screen.getByTestId('toggle-home'));
    expect(mockItems.get('home')?.[0].checked).toBe(true);
    expect(screen.queryByTestId('increase-home')).toBeNull();
    fireEvent.press(screen.getByText(/Déjà pris/));
    fireEvent.press(screen.getByTestId('increase-home'));
    fireEvent.press(screen.getByTestId('decrease-home'));
    fireEvent.press(screen.getByTestId('decrease-home'));
    expect(mockItems.get('home')?.[0].quantity).toBe(1);
    fireEvent.press(screen.getByTestId('remove-home'));
    expect(screen.queryByTestId('quantity-home')).toBeNull();
    expect(mockItems.get('home')?.[0].deletedAt).toBeGreaterThan(0);
  });
  it('keeps the immediately added barcode item when lookup fails', async () => {
    const request = deferred<Awaited<ReturnType<typeof getProduct>>>();
    jest.mocked(getProduct).mockReturnValue(request.promise);
    const screen = render(<HomeScreen />);
    fireEvent.press(screen.getByLabelText('Ajouter un article'));
    fireEvent.press(screen.getByLabelText('Scanner un code-barres'));
    fireEvent.press(screen.getByText('Simuler scan'));
    expect(mockItems.get('home')).toEqual(expect.arrayContaining([expect.objectContaining({ barcode: '3017620422003', name: 'Produit 3017620422003' })]));
    await act(async () => request.reject(new Error('offline')));
    expect(mockItems.get('home')).toHaveLength(2);
    expect(screen.getByText(/Article ajouté · Nom indisponible/)).toBeTruthy();
  });
  it.each([
    ['Cristaline', ['Boissons']],
    ['Evian', ['en:waters']],
    ['Jus de pomme', ['Boissons']],
  ])('uses API categories for scanned %s', async (name, categories) => {
    jest.mocked(getProduct).mockResolvedValue({
      barcode: '3017620422003', product_name: name, categories,
      cached: false, stale: false, source: 'fixture', ttl_seconds: 10,
    });
    const screen = render(<HomeScreen />);
    fireEvent.press(screen.getByLabelText('Ajouter un article'));
    fireEvent.press(screen.getByLabelText('Scanner un code-barres'));
    await act(async () => fireEvent.press(screen.getByText('Simuler scan')));
    expect(mockItems.get('home')?.find((item) => item.barcode)).toMatchObject({ name, category: 'Boissons' });
  });
  it('normalizes a long enriched name and uses a generic store category', async () => {
    jest.mocked(getProduct).mockResolvedValue({
      barcode: '3017620422003', product_name: 'Lait ' + 'é'.repeat(200), categories: ['en:dairy-products'],
      cached: false, stale: false, source: 'fixture', ttl_seconds: 10,
    });
    const screen = render(<HomeScreen />);
    fireEvent.press(screen.getByLabelText('Ajouter un article'));
    fireEvent.press(screen.getByLabelText('Scanner un code-barres'));
    await act(async () => fireEvent.press(screen.getByText('Simuler scan')));
    const scanned = mockItems.get('home')?.find((item) => item.barcode);
    expect(scanned?.name).toBe('Lait ' + 'é'.repeat(97));
    expect(scanned?.category).toBe('Crémerie & produits laitiers');
    expect(screen.getByTestId('scanner-modal').props.visible).toBe(true);
    await act(async () => fireEvent.press(screen.getByText('Simuler scan')));
    expect(mockItems.get('home')?.find((item) => item.barcode)?.quantity).toBe(2);
    expect(getProduct).toHaveBeenCalledTimes(1);
    fireEvent(screen.getByTestId('scanner-modal'), 'requestClose');
    expect(screen.queryByTestId('scanner-modal')).toBeNull();
  });
});

it('persists and recategorizes an edited item immediately', () => {
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByTestId('rename-home'));
  expect(mockItems.get('home')?.[0]).toMatchObject({ name: 'Pain', category: 'Boulangerie' });
  expect(mockItems.get('home')?.[0].updatedAt).toBeGreaterThan(1);
});
it('loads a joined list after an earlier synchronization completes', async () => {
  const pending = deferred<typeof success>();
  mockSync.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(success);
  const screen = render(<HomeScreen />);
  // The opening synchronization is already in flight.
  fireEvent.press(screen.getByText('← Mes listes'));
  fireEvent.press(screen.getByText('Rejoindre une liste'));
  fireEvent.press(screen.getByText('Rejoindre liste test'));
  expect(mockSync).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(success));
  expect(mockSync).toHaveBeenCalledTimes(2);
  expect(mockSync.mock.calls[1][0]).toBe('other');
  expect(Storage.completeSync).toHaveBeenLastCalledWith('other', expect.any(Array), [], 1000, undefined, undefined);
});
it('does not overwrite a user rename when product enrichment finishes later', async () => {
  const pending = deferred<Awaited<ReturnType<typeof getProduct>>>();
  jest.mocked(getProduct).mockReturnValue(pending.promise);
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByLabelText('Ajouter un article'));
    fireEvent.press(screen.getByLabelText('Scanner un code-barres'));
  fireEvent.press(screen.getByText('Simuler scan'));
  const scanned = mockItems.get('home')!.find((item) => item.barcode)!;
  fireEvent.press(screen.getByTestId(`rename-${scanned.id}`));
  await act(async () => pending.resolve({ barcode: scanned.barcode!, product_name: 'Chocolat', categories: [], cached: false, stale: false, source: 'test', ttl_seconds: 1 }));
  expect(mockItems.get('home')!.find((item) => item.id === scanned.id)?.name).toBe('Pain');
});

it('opens the scanner in a visible modal and closes it with Android back', () => {
  const screen = render(<HomeScreen />);
  expect(screen.queryByTestId('scanner-modal')).toBeNull();
  fireEvent.press(screen.getByLabelText('Ajouter un article'));
    fireEvent.press(screen.getByLabelText('Scanner un code-barres'));
  expect(screen.getByTestId('scanner-modal').props.visible).toBe(true);
  screen.getByText('Simuler scan');
  fireEvent(screen.getByTestId('scanner-modal'), 'requestClose');
  expect(screen.queryByTestId('scanner-modal')).toBeNull();
  expect(screen.queryByText('Simuler scan')).toBeNull();
});

describe('automatic synchronization of pending changes', () => {
  const initialAppState = AppState.currentState;
  beforeEach(() => {
    jest.useFakeTimers();
    mockNetwork.isConnected = true;
    mockNetwork.isInternetReachable = true;
    mockItems.set('other', []);
    mockSync.mockReset().mockResolvedValue(success);
  jest.mocked(Storage.getPendingListName).mockReset().mockReturnValue(undefined);
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); mockNetwork.isConnected = true; AppState.currentState = initialAppState; });
  async function openAfterStartup() {
    const screen = render(<HomeScreen />);
    await act(async () => {});
    mockSync.mockClear();
    jest.mocked(Storage.completeSync).mockClear();
    return screen;
  }
  it('receives remote changes after 15 seconds without a local edit', async () => {
    AppState.currentState = 'active';
    mockItems.set('home', [{ ...milk(), syncedAt: 1 }]);
    const screen = await openAfterStartup();
    jest.mocked(Storage.completeSync).mockImplementationOnce(() => [{ ...milk(), quantity: 7, syncedAt: 2 }]);
    await act(async () => jest.advanceTimersByTimeAsync(14_999));
    expect(mockSync).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTimeAsync(1));
    expect(mockSync).toHaveBeenCalledWith('home', [], 0);
    expect(screen.getByTestId('quantity-home').props.children).toBe('7');
    screen.unmount();
  });
  it('stops refresh while backgrounded and resumes on return', async () => {
    AppState.currentState = 'active';
    const onChange = observeAppState();
    mockItems.set('home', [{ ...milk(), syncedAt: 1 }]);
    const screen = await openAfterStartup();
    act(() => onChange('background'));
    await act(async () => jest.advanceTimersByTimeAsync(120_000));
    expect(mockSync).not.toHaveBeenCalled();
    await act(async () => onChange('active'));
    expect(mockSync).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTimeAsync(15_000));
    expect(mockSync).toHaveBeenCalledTimes(2);
    screen.unmount();
  });
  it('batches repeated quantity edits one second after the latest one', async () => {
    const screen = await openAfterStartup();
    fireEvent.press(screen.getByTestId('increase-home'));
    await act(async () => jest.advanceTimersByTimeAsync(500));
    fireEvent.press(screen.getByTestId('increase-home'));
    await act(async () => jest.advanceTimersByTimeAsync(999));
    expect(mockSync).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTimeAsync(1));
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalledWith('home', [expect.objectContaining({ quantity: 3 })], 0);
    screen.unmount();
  });
  it('sends the old list after switching without replacing the visible list', async () => {
    const screen = await openAfterStartup();
    fireEvent.press(screen.getByTestId('increase-home'));
    fireEvent.press(screen.getByText('← Mes listes'));
    fireEvent.press(screen.getByText('Choisir autre liste'));
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    expect(mockSync).toHaveBeenCalledWith('home', [expect.objectContaining({ quantity: 2 })], 0);
    expect(screen.queryByTestId('quantity-home')).toBeNull();
    screen.unmount();
  });
  it('resumes pending changes one second after reconnecting', async () => {
    mockNetwork.isConnected = false;
    mockSync.mockResolvedValue({ synced: false, reason: 'offline' });
    const screen = await openAfterStartup();
    fireEvent.press(screen.getByTestId('increase-home'));
    await act(async () => jest.advanceTimersByTimeAsync(10000));
    // The engine probes connectivity once and keeps the offline changes queued.
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(Storage.completeSync).not.toHaveBeenCalled();
    mockSync.mockClear();
    mockNetwork.isConnected = true;
    mockSync.mockResolvedValue(success);
    screen.rerender(<HomeScreen />);
    await act(async () => jest.advanceTimersByTimeAsync(999));
    expect(mockSync).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTimeAsync(1));
    expect(mockSync).toHaveBeenCalledTimes(1);
    screen.unmount();
  });
  it('waits for the opening request then sends edits made during that request', async () => {
    const request = deferred<typeof success>();
    mockSync.mockReturnValueOnce(request.promise);
    const screen = render(<HomeScreen />);
    // The opening synchronization is already in flight.
    fireEvent.press(screen.getByTestId('increase-home'));
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    expect(mockSync).toHaveBeenCalledTimes(1);
    await act(async () => request.resolve(success));
    expect(mockSync).toHaveBeenCalledTimes(2);
    expect(mockSync).toHaveBeenLastCalledWith('home', [expect.objectContaining({ quantity: 2 })], 0);
    screen.unmount();
  });
  it('checks fresh connectivity when the displayed network state is stale', async () => {
    mockNetwork.isConnected = false;
    // The engine's native probe succeeds, as it would for manual synchronization.
    const screen = await openAfterStartup();
    fireEvent.press(screen.getByTestId('increase-home'));
    await act(async () => jest.advanceTimersByTimeAsync(999));
    expect(mockSync).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTimeAsync(1));
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(Storage.completeSync).toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTimeAsync(30000));
    expect(mockSync).toHaveBeenCalledTimes(1);
    screen.unmount();
  });
  function observeAppState() {
    let callback!: (state: AppStateStatus) => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, handler) => {
      callback = handler;
      return { remove: jest.fn() };
    });
    return (state: AppStateStatus) => callback(state);
  }
  it('flushes the latest edit after an earlier snapshot finishes, without concurrent sends', async () => {
    const onChange = observeAppState();
    const request = deferred<typeof success>();
    mockSync.mockReturnValueOnce(request.promise);
    const screen = render(<HomeScreen />);
    fireEvent.press(screen.getByTestId('increase-home'));
    act(() => onChange('background'));
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync.mock.calls[0][1][0].quantity).toBe(1);
    await act(async () => request.resolve(success));
    expect(mockSync).toHaveBeenCalledTimes(2);
    expect(mockSync.mock.calls[1][1][0].quantity).toBe(2);
    await act(async () => jest.advanceTimersByTimeAsync(10000));
    expect(mockSync).toHaveBeenCalledTimes(2);
    screen.unmount();
  });
  it('flushes pending lists sequentially with the displayed list first', async () => {
    const onChange = observeAppState();
    const screen = await openAfterStartup();
    mockItems.set('other', [milk('other')]);
    fireEvent.press(screen.getByText('← Mes listes'));
    fireEvent.press(screen.getByText('Choisir autre liste'));
    const request = deferred<typeof success>();
    mockSync.mockReturnValueOnce(request.promise);
    act(() => onChange('background'));
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync.mock.calls[0][0]).toBe('other');
    await act(async () => request.resolve(success));
    expect(mockSync.mock.calls.map((call) => call[0])).toEqual(['other', 'home']);
    screen.unmount();
  });
  it('does not send an empty list on leaving or retry background failures in a loop', async () => {
    const onChange = observeAppState();
    const screen = await openAfterStartup();
    mockItems.set('home', []);
    await act(async () => onChange('background'));
    expect(mockSync).not.toHaveBeenCalled();
    await act(async () => onChange('active'));
    mockSync.mockClear().mockRejectedValue(new Error('network unavailable'));
    fireEvent.press(screen.getByLabelText('Ajouter un article'));
    fireEvent.changeText(screen.getByTestId('add-item-input'), 'Pain');
    fireEvent.press(screen.getByTestId('add-item-button'));
    await act(async () => { onChange('inactive'); onChange('background'); });
    await act(async () => jest.advanceTimersByTimeAsync(10000));
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(Storage.getPendingChanges('home')).toHaveLength(1);
    mockSync.mockResolvedValue(success);
    await act(async () => onChange('active'));
    expect(mockSync).toHaveBeenCalledTimes(2);
    expect(mockSync.mock.calls[1][1][0].name).toBe('Pain');
    screen.unmount();
  });
  it('cancels queued background sends on unmount while preserving saved edits', async () => {
    const onChange = observeAppState();
    const request = deferred<typeof success>();
    mockSync.mockReturnValueOnce(request.promise);
    const screen = render(<HomeScreen />);
    fireEvent.press(screen.getByTestId('increase-home'));
    act(() => onChange('background'));
    screen.unmount();
    await act(async () => request.resolve(success));
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(Storage.getPendingChanges('home')[0].quantity).toBe(2);
  });
  it('attempts one immediate send when leaving and does not poll in the background', async () => {
    let onChange!: (state: AppStateStatus) => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback) => {
      onChange = callback;
      return { remove: jest.fn() };
    });
    const screen = await openAfterStartup();
    fireEvent.press(screen.getByTestId('increase-home'));
    await act(async () => { onChange('inactive'); onChange('background'); });
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenLastCalledWith('home', [expect.objectContaining({ quantity: 2 })], 0);
    await act(async () => jest.advanceTimersByTimeAsync(10000));
    expect(mockSync).toHaveBeenCalledTimes(1);
    await act(async () => onChange('active'));
    expect(mockSync).toHaveBeenCalledTimes(2);
    screen.unmount();
  });
});

describe('adding an existing article', () => {
  it('increments one row for case and whitespace variants, even for rapid additions', () => {
    mockItems.set('home', [{ ...milk(), name: '  Lait  ', checked: true }]);
    const screen = render(<HomeScreen />);
    fireEvent.press(screen.getByLabelText('Ajouter un article'));
    fireEvent.changeText(screen.getByTestId('add-item-input'), ' lait\u00a0 ');
    const button = screen.getByTestId('add-item-button');
    act(() => { fireEvent.press(button); fireEvent.press(button); });
    expect(mockItems.get('home')).toHaveLength(1);
    expect(mockItems.get('home')![0]).toMatchObject({ id: 'home', name: 'Lait', quantity: 3, checked: false });
    expect(mockItems.get('home')![0].updatedAt).toBeGreaterThan(1);
    expect(screen.getByTestId('add-item-input').props.value).toBe('');
  });
  it('cleans multiple spaces and recognizes the normalized name on a second addition', () => {
    const screen = render(<HomeScreen />);
    fireEvent.press(screen.getByLabelText('Ajouter un article'));
    for (const name of [' Pain   de\t mie ', 'pain de mie ']) {
      fireEvent.changeText(screen.getByTestId('add-item-input'), name);
      fireEvent.press(screen.getByTestId('add-item-button'));
    }
    expect(mockItems.get('home')).toHaveLength(2);
    expect(mockItems.get('home')![0]).toMatchObject({ name: 'Pain de mie', quantity: 2 });
  });
  it('does not reuse a deleted row or an article belonging to another list', () => {
    mockItems.set('home', [{ ...milk(), deletedAt: 2 }]);
    const screen = render(<HomeScreen />);
    fireEvent.press(screen.getByLabelText('Ajouter un article'));
    fireEvent.changeText(screen.getByTestId('add-item-input'), 'Lait');
    fireEvent.press(screen.getByTestId('add-item-button'));
    expect(mockItems.get('home')).toHaveLength(2);
    expect(mockItems.get('home')![0]).toMatchObject({ name: 'Lait', quantity: 1 });
    expect(mockItems.get('home')![1].deletedAt).toBe(2);
    expect(mockItems.get('other')![0].quantity).toBe(1);
  });
  it('reports the quantity limit without creating a duplicate or discarding the input', () => {
    mockItems.set('home', [{ ...milk(), quantity: 999 }]);
    const screen = render(<HomeScreen />);
    fireEvent.press(screen.getByLabelText('Ajouter un article'));
    fireEvent.changeText(screen.getByTestId('add-item-input'), 'Lait ');
    fireEvent.press(screen.getByTestId('add-item-button'));
    expect(mockItems.get('home')).toHaveLength(1);
    expect(mockItems.get('home')![0].quantity).toBe(999);
    expect(Storage.saveCurrentList).not.toHaveBeenCalled();
    expect(screen.getByTestId('add-item-input').props.value).toBe('Lait ');
    screen.getByText('La quantité totale ne peut pas dépasser 999.');
  });
  it('increments a repeated barcode while its first lookup is still pending', async () => {
    const request = deferred<Awaited<ReturnType<typeof getProduct>>>();
    jest.mocked(getProduct).mockReturnValue(request.promise);
    const screen = render(<HomeScreen />);
    for (let i = 0; i < 2; i++) {
      fireEvent.press(screen.getByLabelText('Ajouter un article'));
    fireEvent.press(screen.getByLabelText('Scanner un code-barres'));
      fireEvent.press(screen.getByText('Simuler scan'));
    }
    expect(getProduct).toHaveBeenCalledTimes(1);
    expect(mockItems.get('home')).toHaveLength(2);
    expect(mockItems.get('home')![0].quantity).toBe(2);
    await act(async () => request.resolve({ barcode: '3017620422003', product_name: '  CHOCOLAT   NOIR  ', categories: [], cached: false, stale: false, source: 'test', ttl_seconds: 1 }));
    expect(mockItems.get('home')![0]).toMatchObject({ name: 'Chocolat noir', quantity: 2 });
  });
  it('does not overflow quantities or create a new article when rescanning at the limit', () => {
    mockItems.set('home', [{ ...milk(), barcode: '3017620422003', quantity: 999 }]);
    const screen = render(<HomeScreen />);
    fireEvent.press(screen.getByLabelText('Ajouter un article'));
    fireEvent.press(screen.getByLabelText('Scanner un code-barres'));
    fireEvent.press(screen.getByText('Simuler scan'));
    expect(mockItems.get('home')).toHaveLength(1);
    expect(getProduct).not.toHaveBeenCalled();
    expect(Storage.saveCurrentList).not.toHaveBeenCalled();
    screen.getByText('La quantité maximale de cet article est déjà atteinte (999).');
  });
});

describe('synchronization on opening and returning to the app', () => {
  const initialAppState = AppState.currentState;
  let onChange: (state: AppStateStatus) => void;
  const remove = jest.fn();
  beforeEach(() => {
    mockItems.set('home', []);
    mockItems.set('other', []);
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback) => {
      onChange = callback;
      return { remove };
    });
  });
  afterEach(() => { AppState.currentState = initialAppState; jest.restoreAllMocks(); });

  it('fetches and displays remote items immediately on launch with no local changes', async () => {
    const remote = { ...milk(), quantity: 4, syncedAt: 1000 };
    mockSync.mockResolvedValue({ ...success, remoteItems: [remote] });
    jest.mocked(Storage.completeSync).mockImplementationOnce((id, _sent, items) => {
      mockItems.set(id, items);
      return items;
    });
    const screen = render(<HomeScreen />);
    await act(async () => {});
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalledWith('home', [], 0);
    expect(screen.getByTestId('quantity-home').props.children).toBe('4');
    fireEvent.press(screen.getByLabelText('État de synchronisation'));
    screen.getByText('Liste synchronisée.');
    screen.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('refreshes the current list on return, ignoring repeated active events', async () => {
    const screen = render(<HomeScreen />);
    await act(async () => {});
    fireEvent.press(screen.getByText('← Mes listes'));
    fireEvent.press(screen.getByText('Choisir autre liste'));
    act(() => onChange('inactive'));
    act(() => onChange('background'));
    expect(mockSync).toHaveBeenCalledTimes(1);
    await act(async () => onChange('active'));
    expect(mockSync).toHaveBeenCalledTimes(2);
    expect(mockSync).toHaveBeenLastCalledWith('other', [], 0);
    await act(async () => { onChange('active'); onChange('active'); });
    expect(mockSync).toHaveBeenCalledTimes(2);
    screen.unmount();
  });

  it('reuses an unfinished sync instead of launching a concurrent request on return', async () => {
    const request = deferred<typeof success>();
    mockSync.mockReturnValue(request.promise);
    const screen = render(<HomeScreen />);
    act(() => onChange('background'));
    act(() => onChange('active'));
    expect(mockSync).toHaveBeenCalledTimes(1);
    await act(async () => request.resolve(success));
    screen.unmount();
  });

  it('keeps offline edits and retries on returning without requiring a cached network event', async () => {
    mockItems.set('home', [milk()]);
    mockSync.mockResolvedValue({ synced: false, reason: 'offline' });
    const screen = render(<HomeScreen />);
    await act(async () => {});
    fireEvent.press(screen.getByLabelText('État de synchronisation'));
    screen.getByText('Hors ligne: sync reportée.');
    expect(Storage.completeSync).not.toHaveBeenCalled();
    expect(mockItems.get('home')![0].quantity).toBe(1);
    await act(async () => onChange('background'));
    expect(Storage.completeSync).not.toHaveBeenCalled();
    mockSync.mockResolvedValue(success);
    await act(async () => onChange('active'));
    expect(mockSync).toHaveBeenCalledTimes(3);
    expect(mockSync).toHaveBeenLastCalledWith('home', [expect.objectContaining({ quantity: 1 })], 0);
    screen.unmount();
  });

  it('does not start while mounted in the background, and retains manual refresh', async () => {
    AppState.currentState = 'background';
    const screen = render(<HomeScreen />);
    expect(mockSync).not.toHaveBeenCalled();
    await act(async () => onChange('active'));
    expect(mockSync).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('État de synchronisation'));
    await act(async () => fireEvent.press(screen.getByText('Synchroniser maintenant')));
    expect(mockSync).toHaveBeenCalledTimes(2);
    screen.unmount();
  });
});

it('imports reviewed OCR items into the active list and closes the photo flow', () => {
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByLabelText('Ajouter un article'));
  fireEvent.press(screen.getByLabelText('Scanner une liste écrite'));
  fireEvent.press(screen.getByText('Valider OCR test'));
  expect(mockItems.get('home')).toHaveLength(2);
  expect(mockItems.get('home')!.find((item) => item.id === 'home')?.quantity).toBe(3);
  expect(mockItems.get('home')!.find((item) => item.name === 'Pain')?.quantity).toBe(1);
  expect(mockItems.get('other')).toHaveLength(1);
  expect(screen.queryByTestId('ocr-modal')).toBeNull();
});
it('closes the OCR modal with Android back without adding anything', () => {
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByLabelText('Ajouter un article'));
  fireEvent.press(screen.getByLabelText('Scanner une liste écrite'));
  fireEvent(screen.getByTestId('ocr-modal'), 'requestClose');
  expect(mockItems.get('home')).toHaveLength(1);
  expect(screen.queryByTestId('ocr-modal')).toBeNull();
});


it('saves the section order per list without changing articles, and restores it on reopening', async () => {
  mockItems.set('home', [{ ...milk(), category: 'Boissons' }, { ...milk(), id: 'bread', name: 'Pain', category: 'Boulangerie' }]);
  const screen = render(<HomeScreen />);
  await act(async () => {});
  fireEvent.press(screen.getByLabelText('Trier les rayons'));
  for (let i = 0; i < 7; i++) fireEvent.press(screen.getByLabelText('Monter Boissons'));
  fireEvent.press(screen.getByText('Enregistrer'));
  expect(Storage.saveCategoryOrder).toHaveBeenCalledWith('home', expect.arrayContaining(['boissons']));
  expect(mockCategoryOrders.get('home')?.[0]).toBe('boissons');
  expect(Storage.saveCurrentList).not.toHaveBeenCalled();
  expect(screen.getAllByTestId(/^section-/).map((node) => node.props.testID)).toEqual(['section-Boissons', 'section-Boulangerie']);
  fireEvent.press(screen.getByText('← Mes listes'));
    fireEvent.press(screen.getByText('Choisir autre liste'));
  fireEvent.press(screen.getByLabelText('Trier les rayons'));
  expect(screen.getByTestId('category-order-row-fruits-legumes').props.style.top).toBe(0);
  fireEvent.press(screen.getByText('Annuler'));
  screen.unmount();
  mockActiveList = 'home';
  const reopened = render(<HomeScreen />);
  await act(async () => {});
  expect(reopened.getAllByTestId(/^section-/).map((node) => node.props.testID)).toEqual(['section-Boissons', 'section-Boulangerie']);
});

it('discards a draft order when Android Back closes the editor', async () => {
  const screen = render(<HomeScreen />);
  await act(async () => {});
  fireEvent.press(screen.getByLabelText('Trier les rayons'));
  fireEvent.press(screen.getByLabelText('Monter Boissons'));
  fireEvent(screen.getByTestId('category-order-modal'), 'requestClose');
  expect(Storage.saveCategoryOrder).not.toHaveBeenCalled();
  expect(screen.queryByTestId('category-order-modal')).toBeNull();
});

it('adds the chosen quantity, merges duplicates, and rejects a total over 999 atomically', () => {
  mockItems.set('home', [{ ...milk(), quantity: 995, checked: true }]);
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByLabelText('Ajouter un article'));
  fireEvent.changeText(screen.getByTestId('add-item-input'), ' lait  ');
  fireEvent.changeText(screen.getByLabelText('Quantité à ajouter'), '5');
  fireEvent.press(screen.getByTestId('add-item-button'));
  expect(Storage.saveCurrentList).not.toHaveBeenCalled();
  screen.getByRole('alert');
  fireEvent.changeText(screen.getByLabelText('Quantité à ajouter'), '3');
  fireEvent.press(screen.getByTestId('add-item-button'));
  expect(mockItems.get('home')).toEqual([expect.objectContaining({ quantity: 998, checked: false })]);
  expect(screen.getByLabelText('Quantité à ajouter').props.value).toBe('1');
});
it('rejects invalid quantities and keeps the draft editable', () => {
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByLabelText('Ajouter un article'));
  fireEvent.changeText(screen.getByTestId('add-item-input'), 'Pain');
  for (const amount of ['0', '', '1.5', '-1']) {
    fireEvent.changeText(screen.getByLabelText('Quantité à ajouter'), amount);
    fireEvent.press(screen.getByTestId('add-item-button'));
    expect(Storage.saveCurrentList).not.toHaveBeenCalled();
  }
  expect(screen.getByTestId('add-item-input').props.value).toBe('Pain');
});
it('lets a checked item return to its original aisle without deleting it', () => {
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByTestId('toggle-home'));
  expect(screen.queryByTestId('toggle-home')).toBeNull();
  fireEvent.press(screen.getByText(/Déjà pris/));
  fireEvent.press(screen.getByTestId('toggle-home'));
  expect(mockItems.get('home')![0]).toMatchObject({ checked: false });
  expect(mockItems.get('home')![0].deletedAt).toBeUndefined();
  expect(screen.queryByText(/Déjà pris/)).toBeNull();
  screen.getByTestId('toggle-home');
});

it('opens a received invitation even while the sharing panel is closed', async () => {
  const invitation = 'a'.repeat(32);
  const initial = jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  let receive!: (event: { url: string }) => void;
  const listener = jest.spyOn(Linking, 'addEventListener').mockImplementation((_, callback) => {
    receive = callback; return { remove: jest.fn() } as unknown as ReturnType<typeof Linking.addEventListener>;
  });
  try {
    const screen = render(<HomeScreen />);
    await act(async () => {});
    expect(screen.queryByText('Rejoindre liste test')).toBeNull();
    act(() => receive({ url: 'smartshopping://invite/' + invitation }));
    screen.getByText(invitation);
    screen.getByText('Rejoindre liste test');
  } finally { initial.mockRestore(); listener.mockRestore(); }
});

it('stores pain, Pain and PAIN as one article named Pain with quantity three', () => {
  mockItems.set('home', []);
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByLabelText('Ajouter un article'));
  for (const name of ['pain', 'Pain', 'PAIN ']) {
    fireEvent.changeText(screen.getByTestId('add-item-input'), name);
    fireEvent.press(screen.getByTestId('add-item-button'));
  }
  expect(mockItems.get('home')).toEqual([expect.objectContaining({ name: 'Pain', quantity: 3 })]);
});


it('shows Mes listes without a back button and returns there from joining', async () => {
  const screen = render(<HomeScreen />);
  await act(async () => {});
  fireEvent.press(screen.getByText('← Mes listes'));
  screen.getByText('Mes listes');
  expect(screen.queryByLabelText('Fermer Mes listes')).toBeNull();
  expect(screen.queryByText('← Retour')).toBeNull();
  fireEvent.press(screen.getByText('Rejoindre une liste'));
  fireEvent.press(screen.getByLabelText('Fermer Rejoindre une liste'));
  screen.getByText('Mes listes');
  screen.getByText('Rejoindre une liste');
  fireEvent.press(screen.getByText('Choisir autre liste'));
  screen.getByTestId('quantity-other');
});


it('renames and removes the requested list while staying in Mes listes', async () => {
  const screen = render(<HomeScreen />);
  await act(async () => {});
  fireEvent.press(screen.getByText('← Mes listes'));
  fireEvent.press(screen.getByText('Renommer autre liste test'));
  expect(Storage.renameList).toHaveBeenCalledWith('other', 'Vacances');
  fireEvent.press(screen.getByText('Supprimer autre liste test'));
  expect(Storage.archiveList).toHaveBeenCalledWith('other');
  expect(mockActiveList).toBe('home');
  screen.getByText('Mes listes');
});

it('stays in Mes listes after removing the active list and selects a remaining list', async () => {
  const screen = render(<HomeScreen />);
  await act(async () => {});
  fireEvent.press(screen.getByText('← Mes listes'));
  fireEvent.press(screen.getByText('Supprimer liste ouverte test'));
  expect(Storage.archiveList).toHaveBeenCalledWith('home');
  expect(mockActiveList).toBe('other');
  screen.getByText('Mes listes');
});


it('renames the open list directly from its options and returns to those options', async () => {
  const screen = render(<HomeScreen />);
  await act(async () => {});
  fireEvent.press(screen.getByLabelText('Options de la liste'));
  expect(screen.queryByText('Nom et gestion de la liste')).toBeNull();
  screen.getByText('Vider la liste');
  fireEvent.press(screen.getByText('Renommer'));
  expect(screen.getByLabelText('Nom de la liste').props.value).toBe('home');
  fireEvent.changeText(screen.getByLabelText('Nom de la liste'), 'Courses semaine');
  fireEvent.press(screen.getByText('Enregistrer'));
  expect(Storage.renameList).toHaveBeenCalledWith('home', 'Courses semaine');
  expect(screen.queryByLabelText('Nom de la liste')).toBeNull();
  screen.getByLabelText('Fermer Options de la liste');
  expect(screen.queryByText('Mes listes')).toBeNull();
});

it('requires confirmation before deleting the open list directly from its options', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  try {
    const screen = render(<HomeScreen />);
    await act(async () => {});
    fireEvent.press(screen.getByLabelText('Options de la liste'));
    fireEvent.press(screen.getByLabelText('Supprimer la liste home'));
    expect(alert).toHaveBeenCalledWith('Supprimer « home » ?', expect.any(String), expect.any(Array));
    expect(Storage.archiveList).not.toHaveBeenCalled();
    act(() => alert.mock.calls[0][2]?.find((button) => button.text === 'Supprimer')?.onPress?.());
    expect(Storage.archiveList).toHaveBeenCalledWith('home');
    screen.getByText('Mes listes');
  } finally { alert.mockRestore(); }
});


it('creates and opens a list with the name chosen by the user', async () => {
  const screen = render(<HomeScreen />);
  await act(async () => {});
  fireEvent.press(screen.getByText('← Mes listes'));
  fireEvent.press(screen.getByText('Créer liste nommée test'));
  expect(Storage.createList).toHaveBeenCalledWith('Vacances');
  expect(mockActiveList).toBe('created');
  expect(screen.queryByText('Mes listes')).toBeNull();
});

it('saves a category-only change and includes it in the next sync', async () => {
  jest.useFakeTimers();
  try {
    mockItems.set('home', [{ ...milk(), name: 'Quinoa', category: 'À classer' }]);
    const screen = render(<HomeScreen />);
    await act(async () => {});
    mockSync.mockClear();
    fireEvent.press(screen.getByTestId('category-home'));
    expect(mockItems.get('home')?.[0]).toMatchObject({ name: 'Quinoa', category: 'Épicerie salée' });
    screen.getByTestId('section-Épicerie salée');
    await act(async () => jest.advanceTimersByTimeAsync(1_000));
    expect(mockSync).toHaveBeenCalledWith('home', [expect.objectContaining({ category: 'Épicerie salée' })], 0);
    screen.unmount();
  } finally { jest.useRealTimers(); }
});

it('preserves a chosen category when a barcode lookup finishes later', async () => {
  const request = deferred<Awaited<ReturnType<typeof getProduct>>>();
  jest.mocked(getProduct).mockReturnValue(request.promise);
  const screen = render(<HomeScreen />);
  await act(async () => {});
  fireEvent.press(screen.getByLabelText('Ajouter un article'));
  fireEvent.press(screen.getByLabelText('Scanner un code-barres'));
  fireEvent.press(screen.getByText('Simuler scan'));
  const scanned = mockItems.get('home')!.find((entry) => entry.barcode)!;
  fireEvent.press(screen.getByTestId(`category-${scanned.id}`));
  await act(async () => request.resolve({
    barcode: scanned.barcode!, product_name: 'Lait', categories: ['Crémerie & produits laitiers'],
    cached: false, stale: false, source: 'fixture', ttl_seconds: 10,
  }));
  expect(mockItems.get('home')!.find((entry) => entry.id === scanned.id)).toMatchObject({ name: 'Lait', category: 'Épicerie salée' });
});


it('starts on Mes listes and keeps settings and joining on the home screen', async () => {
  const screen = renderNative(<HomeScreen />);
  await act(async () => {});
  screen.getByTestId('lists-home');
  screen.getByText('Rejoindre une liste');
  expect(screen.queryByLabelText('Ajouter un article')).toBeNull();
  expect(screen.queryByText('← Retour')).toBeNull();
  fireEvent.press(screen.getByLabelText('Réglages'));
  fireEvent.press(screen.getByLabelText('Fermer Réglages'));
  screen.getByTestId('lists-home');
  fireEvent.press(screen.getByText('Rejoindre une liste'));
  fireEvent.press(screen.getByLabelText('Fermer Rejoindre une liste'));
  screen.getByTestId('lists-home');
});

it('returns to the home screen with Android Back without exiting a shopping list', async () => {
  const listener = jest.spyOn(BackHandler, 'addEventListener');
  try {
    const screen = renderNative(<HomeScreen />);
    await act(async () => {});
    const atHome = listener.mock.calls[listener.mock.calls.length - 1][1];
    expect(atHome()).toBe(false);
    fireEvent.press(screen.getByText('Ouvrir liste active test'));
    expect(screen.queryByTestId('lists-home')).toBeNull();
    const inList = listener.mock.calls[listener.mock.calls.length - 1][1];
    act(() => { expect(inList()).toBe(true); });
    screen.getByTestId('lists-home');
    screen.unmount();
  } finally { listener.mockRestore(); }
});

it('automatically sends a rename of an empty non-active list', async () => {
  jest.useFakeTimers();
  mockItems = new Map([['home', []], ['other', []]]);
  const screen = renderNative(<HomeScreen />);
  try {
    await act(async () => {});
    mockSync.mockClear();
    const name = { name: 'Vacances', updated_at: 50 };
    jest.mocked(Storage.getPendingListName).mockImplementation((id) => id === 'other' ? name : undefined);
    fireEvent.press(screen.getByText('Renommer autre liste test'));
    await act(async () => { jest.advanceTimersByTime(999); });
    expect(mockSync).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(mockSync).toHaveBeenCalledWith('other', [], 0, name);
    expect(Storage.completeSync).toHaveBeenLastCalledWith('other', [], [], 1000, name, undefined);
  } finally { screen.unmount(); jest.useRealTimers(); }
});

it('refreshes non-active lists while the directory is visible, with bounded rounds', async () => {
  jest.useFakeTimers();
  const initialState = AppState.currentState;
  AppState.currentState = 'active';
  mockItems = new Map(['home', 'a', 'b', 'c', 'd'].map((id) => [id, []]));
  const getLists = jest.spyOn(Storage, 'getLists').mockImplementation(() => ['home', 'a', 'b', 'c', 'd'].map((id) => ({ id, syncDisabled: mockDisabledLists.has(id), name: id, createdAt: 1, updatedAt: 1 })));
  const screen = renderNative(<HomeScreen />);
  try {
    await act(async () => {});
    mockSync.mockClear();
    await act(async () => { jest.advanceTimersByTime(15000); });
    expect(mockSync.mock.calls.map((call) => call[0])).toEqual(['a', 'b', 'c']);
    mockSync.mockClear();
    await act(async () => { jest.advanceTimersByTime(15000); });
    expect(mockSync.mock.calls.map((call) => call[0])).toEqual(['d', 'home', 'a']);
    mockSync.mockClear().mockRejectedValueOnce(new Error('Access revoked'));
    await act(async () => { jest.advanceTimersByTime(15000); });
    expect(mockSync.mock.calls.map((call) => call[0])).toEqual(['b']);
    mockSync.mockClear();
    await act(async () => { jest.advanceTimersByTime(30000); });
    expect(mockSync.mock.calls.map((call) => call[0])).toEqual(['c', 'd', 'home']);
  } finally { screen.unmount(); getLists.mockRestore(); AppState.currentState = initialState; jest.useRealTimers(); }
});

it('updates the open list heading when a remote name is received', async () => {
  const getLists = jest.spyOn(Storage, 'getLists');
  const screen = render(<HomeScreen />);
  try {
    getLists.mockReturnValue([{ id: 'home', name: 'Famille', createdAt: 1, updatedAt: 1 }]);
    await act(async () => {});
    screen.getByText('Famille');
  } finally { screen.unmount(); getLists.mockRestore(); }
});

it('sorts articles within their aisle and checked items without saving display-only changes', async () => {
  mockItems.set('home', [
    { ...milk(), id: 'riz', name: 'Riz', category: 'Épicerie salée' },
    { ...milk(), id: 'pain', name: 'Pain', category: 'Épicerie salée' },
    { ...milk(), id: 'z', name: 'Yaourt', checked: true },
    { ...milk(), id: 'a', name: 'Abricots', checked: true },
  ]);
  const screen = render(<HomeScreen />);
  try {
    await act(async () => {});
    const order = () => screen.getAllByTestId(/^quantity-/).map((node) => node.props.testID);
    expect(order()).toEqual(['quantity-pain', 'quantity-riz']);
    expect(Storage.saveCurrentList).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText(/Déjà pris · 2/));
    expect(order()).toEqual(['quantity-pain', 'quantity-riz', 'quantity-a', 'quantity-z']);
    fireEvent.press(screen.getByTestId('increase-riz'));
    expect(order()).toEqual(['quantity-pain', 'quantity-riz', 'quantity-a', 'quantity-z']);
  } finally { screen.unmount(); }
});

it('shares a non-active list directly from home and keeps the active selection', async () => {
  const screen = renderNative(<HomeScreen />);
  try {
    await act(async () => {});
    mockSync.mockClear();
    fireEvent.press(screen.getByText('Partager autre liste test'));
    screen.getByText('Partage cible : other');
    expect(mockActiveList).toBe('home');
    expect(screen.queryByText('Rejoindre liste test')).toBeNull();
    await act(async () => fireEvent.press(screen.getByText('Préparer partage test')));
    expect(mockSync).toHaveBeenCalledWith('other', expect.any(Array), 0);
    expect(mockActiveList).toBe('home');
    fireEvent.press(screen.getByLabelText('Fermer Partager une liste'));
    screen.getByTestId('lists-home');
    fireEvent.press(screen.getByText('Rejoindre une liste'));
    screen.getByText('Rejoindre liste test');
    expect(screen.queryByText('Préparer partage test')).toBeNull();
  } finally { screen.unmount(); }
});

it('keeps the sharing shortcut of the currently open list', async () => {
  const screen = render(<HomeScreen />);
  try {
    await act(async () => {});
    fireEvent.press(screen.getByText('Partager'));
    screen.getByText('Partage cible : home');
    fireEvent.press(screen.getByLabelText('Fermer Partager une liste'));
    expect(screen.queryByTestId('lists-home')).toBeNull();
    screen.getByTestId('quantity-home');
  } finally { screen.unmount(); }
});

it('deletes the list targeted by the sharing menu without changing the other active list', async () => {
  const screen = renderNative(<HomeScreen />);
  try {
    await act(async () => {});
    fireEvent.press(screen.getByText('Partager autre liste test'));
    fireEvent.press(screen.getByText('Suppression serveur test'));
    expect(Storage.deleteListPermanently).toHaveBeenCalledWith('other');
    expect(mockActiveList).toBe('home');
    expect(mockItems.has('home')).toBe(true);
    screen.getByTestId('lists-home');
    expect(screen.queryByText('Partage cible : other')).toBeNull();
  } finally { screen.unmount(); }
});

describe('simultaneous article additions', () => {
  beforeEach(() => {
    mockItems.set('home', [{ ...milk(), id: 'a', name: 'pain' }, { ...milk(), id: 'b', name: 'Pain', quantity: 2 }]);
  });
  it('shows a combined row, then increments and decrements its total', async () => {
    const screen = render(<HomeScreen />);
    await act(async () => {});
    expect(screen.getByTestId('quantity-a').props.children).toBe('3');
    expect(screen.queryByTestId('quantity-b')).toBeNull();
    expect(Storage.saveCurrentList).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('increase-a'));
    expect(screen.getByTestId('quantity-a').props.children).toBe('4');
    fireEvent.press(screen.getByTestId('decrease-a'));
    expect(screen.getByTestId('quantity-a').props.children).toBe('3');
    fireEvent.press(screen.getByTestId('decrease-a'));
    fireEvent.press(screen.getByTestId('decrease-a'));
    expect(screen.getByTestId('quantity-a').props.children).toBe('1');
  });
  it('renames, categorizes, checks and deletes every source behind the row', async () => {
    mockItems.set('home', [{ ...milk(), id: 'a' }, { ...milk(), id: 'b' }]);
    const screen = render(<HomeScreen />);
    await act(async () => {});
    fireEvent.press(screen.getByTestId('rename-a'));
    expect(mockItems.get('home')?.every((item) => item.name === 'Pain')).toBe(true);
    fireEvent.press(screen.getByTestId('category-a'));
    expect(mockItems.get('home')?.every((item) => item.category === 'Épicerie salée')).toBe(true);
    fireEvent.press(screen.getByTestId('toggle-a'));
    expect(mockItems.get('home')?.every((item) => item.checked)).toBe(true);
    fireEvent.press(screen.getByText('⌄ Déjà pris · 1'));
    fireEvent.press(screen.getByTestId('toggle-a'));
    expect(mockItems.get('home')?.every((item) => !item.checked)).toBe(true);
    fireEvent.press(screen.getByTestId('remove-a'));
    expect(mockItems.get('home')?.every((item) => !!item.deletedAt)).toBe(true);
    expect(screen.queryByTestId('quantity-a')).toBeNull();
  });
});

describe('revoked list membership', () => {
  it('preserves edits, disables sharing and stops automatic requests after a sync 403', async () => {
    jest.useFakeTimers();
    try {
      mockSync.mockRejectedValue(new BackendApiError('forbidden', 403, 'ref'));
      const screen = render(<HomeScreen />);
      await act(async () => {});
      screen.getByText('Synchronisation coupée');
      expect(mockDisabledLists.has('home')).toBe(true);
      expect(screen.queryByText(/Envoi interrompu/)).toBeNull();
      fireEvent.press(screen.getByText('Partager'));
      expect(screen.queryByText('Partage cible : home')).toBeNull();
      fireEvent.press(screen.getByTestId('increase-home'));
      expect(screen.getByTestId('quantity-home').props.children).toBe('2');
      fireEvent.press(screen.getByLabelText('État de synchronisation'));
      screen.getByText('Cette copie reste disponible sur cet appareil.');
      expect(screen.queryByText(/changement.*en attente/)).toBeNull();
      fireEvent.press(screen.getByText('Synchroniser maintenant'));
      await act(async () => { jest.advanceTimersByTime(60_000); });
      expect(mockSync).toHaveBeenCalledTimes(1);
    } finally { jest.useRealTimers(); }
  });
  it('persists the disconnected state on reopening, then enables sync only after rejoining', async () => {
    mockActiveList = 'other'; mockDisabledLists.add('other');
    const screen = render(<HomeScreen />);
    await act(async () => {});
    expect(mockSync).not.toHaveBeenCalled();
    screen.getByText('Synchronisation coupée');
    fireEvent.press(screen.getByText('← Mes listes'));
    fireEvent.press(screen.getByText('Rejoindre une liste'));
    await act(async () => fireEvent.press(screen.getByText('Rejoindre liste test')));
    expect(mockDisabledLists.has('other')).toBe(false);
    expect(mockSync).toHaveBeenCalledWith('other', expect.any(Array), 0);
    fireEvent.press(screen.getByText('Partager'));
    screen.getByText('Partage cible : other');
  });
  it.each([401, 500])('keeps retry available for HTTP %s', async (status) => {
    mockSync.mockRejectedValueOnce(new BackendApiError('temporary', status, 'ref'));
    const screen = render(<HomeScreen />);
    await act(async () => {});
    expect(mockDisabledLists.has('home')).toBe(false);
    screen.getByText(/Envoi interrompu/);
    fireEvent.press(screen.getByLabelText('État de synchronisation'));
    await act(async () => fireEvent.press(screen.getByText('Synchroniser maintenant')));
    expect(mockSync).toHaveBeenCalledTimes(2);
  });
  it('records revoked access even when a different list is open', async () => {
    const request = deferred<typeof success>(); mockSync.mockReturnValueOnce(request.promise);
    const screen = render(<HomeScreen />);
    fireEvent.press(screen.getByText('← Mes listes'));
    fireEvent.press(screen.getByText('Choisir autre liste'));
    await act(async () => request.reject(new BackendApiError('forbidden', 403, 'ref')));
    expect(mockDisabledLists.has('home')).toBe(true);
    expect(mockDisabledLists.has('other')).toBe(false);
    expect(screen.queryByText('Synchronisation coupée')).toBeNull();
    fireEvent.press(screen.getByText('Partager'));
    screen.getByText('Partage cible : other');
  });
});


it('lets the standalone APK edit locally before any server is configured', async () => {
  mockTestServerEnabled = true;
  const screen = render(<HomeScreen />);
  await act(async () => {});
  screen.getByText(/Mode local · Serveur à configurer/);
  expect(mockSync).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('increase-home'));
  expect(screen.getByTestId('quantity-home').props.children).toBe('2');
  fireEvent.press(screen.getByLabelText('État de synchronisation'));
  screen.getByText('Serveur de test');
  screen.getByLabelText('Adresse HTTPS du serveur');
});

it('reuses a renamed barcode after removal and in another list, even offline', async () => {
  jest.mocked(getProduct).mockResolvedValue({ barcode: '3017620422003', product_name: 'Nom commercial', categories: [], source: 'test', cached: false, stale: false, ttl_seconds: 60 });
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByLabelText('Ajouter un article'));
  fireEvent.press(screen.getByLabelText('Scanner un code-barres'));
  await act(async () => fireEvent.press(screen.getByText('Simuler scan')));
  fireEvent(screen.getByTestId('scanner-modal'), 'requestClose');
  const scanned = mockItems.get('home')!.find((item) => item.barcode)!;
  fireEvent.press(screen.getByTestId(`rename-${scanned.id}`));
  fireEvent.press(screen.getByTestId(`remove-${scanned.id}`));
  expect(getProductPreference(scanned.barcode!)).toMatchObject({ name: 'Pain' });
  screen.unmount();
  mockActiveList = 'other';
  jest.mocked(getProduct).mockClear().mockRejectedValue(new Error('offline'));
  const restarted = render(<HomeScreen />);
  fireEvent.press(restarted.getByLabelText('Ajouter un article'));
  fireEvent.press(restarted.getByLabelText('Scanner un code-barres'));
  await act(async () => fireEvent.press(restarted.getByText('Simuler scan')));
  expect(getProduct).not.toHaveBeenCalled();
  expect(mockItems.get('other')!.find((item) => item.barcode)).toMatchObject({ name: 'Pain', barcode: scanned.barcode });
});

it('offers naming after a catalogue miss, remembers the choice and keeps the scanner open', async () => {
  jest.mocked(getProduct).mockRejectedValue(new BackendApiError('Not found', 404, 'test'));
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByLabelText('Ajouter un article'));
  fireEvent.press(screen.getByLabelText('Scanner un code-barres'));
  await act(async () => fireEvent.press(screen.getByText('Simuler scan')));
  screen.getByText('Nommer le produit');
  fireEvent.changeText(screen.getByLabelText('Nom du produit scanné'), '  VIN ROUGE ');
  fireEvent.press(screen.getByText('Enregistrer le nom'));
  expect(mockItems.get('home')!.find((item) => item.barcode)).toMatchObject({ name: 'Vin rouge', category: 'Alcools', quantity: 1 });
  expect(getProductPreference('3017620422003')).toEqual({ name: 'Vin rouge', category: 'Alcools' });
  expect(screen.queryByLabelText('Nom du produit scanné')).toBeNull();
  expect(screen.getByTestId('scanner-modal').props.visible).toBe(true);
});

it('keeps a community choice private by default and publishes only after explicit opt-in', async () => {
  jest.mocked(getProduct).mockRejectedValue(new BackendApiError('Not found', 404, 'test'));
  jest.mocked(getCommunitySuggestions).mockResolvedValue({
    barcode: '3017620422003',
    contributions_enabled: true,
    suggestions: [
      { proposal_id: 'name-1', field: 'name', value: 'Pâte à tartiner', confirmations: 2, agreement_ratio: 1 },
      { proposal_id: 'category-1', field: 'category', value: 'Épicerie sucrée', confirmations: 2, agreement_ratio: 1 },
    ],
  });
  jest.mocked(confirmCommunityProposal).mockResolvedValue();
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByLabelText('Ajouter un article'));
  fireEvent.press(screen.getByLabelText('Scanner un code-barres'));
  await act(async () => fireEvent.press(screen.getByText('Simuler scan')));
  fireEvent.press(screen.getByLabelText('Proposition de nom : Pâte à tartiner'));
  fireEvent.press(screen.getByLabelText('Proposition de rayon : Épicerie sucrée'));
  fireEvent.press(screen.getByText('Enregistrer le nom'));
  expect(confirmCommunityProposal).not.toHaveBeenCalled();
  expect(submitCommunityProposal).not.toHaveBeenCalled();
  expect(getProductPreference('3017620422003')).toEqual({ name: 'Pâte à tartiner', category: 'Épicerie sucrée' });

  mockPreferencesDisk.clear();
  mockItems.set('home', [milk()]);
  screen.unmount();
  const optedIn = render(<HomeScreen />);
  fireEvent.press(optedIn.getByLabelText('Ajouter un article'));
  fireEvent.press(optedIn.getByLabelText('Scanner un code-barres'));
  await act(async () => fireEvent.press(optedIn.getByText('Simuler scan')));
  fireEvent.press(optedIn.getByLabelText('Proposition de nom : Pâte à tartiner'));
  fireEvent.press(optedIn.getByLabelText('Proposition de rayon : Épicerie sucrée'));
  fireEvent.press(optedIn.getByLabelText('Participer au catalogue communautaire'));
  fireEvent.press(optedIn.getByText('Enregistrer le nom'));
  await act(async () => {});
  expect(confirmCommunityProposal).toHaveBeenCalledTimes(2);
  expect(submitCommunityProposal).not.toHaveBeenCalled();
});

it('preserves a private name when its public contribution is rejected', async () => {
  jest.mocked(getProduct).mockRejectedValue(new BackendApiError('Not found', 404, 'test'));
  jest.mocked(submitCommunityProposal).mockRejectedValue(new BackendApiError('Public filter', 400, 'test'));
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByLabelText('Ajouter un article'));
  fireEvent.press(screen.getByLabelText('Scanner un code-barres'));
  await act(async () => fireEvent.press(screen.getByText('Simuler scan')));
  fireEvent.changeText(screen.getByLabelText('Nom du produit scanné'), 'Mon nom privé');
  fireEvent.press(screen.getByLabelText('Participer au catalogue communautaire'));
  await act(async () => fireEvent.press(screen.getByText('Enregistrer le nom')));
  expect(getProductPreference('3017620422003')?.name).toBe('Mon nom privé');
  expect(mockItems.get('home')!.find((item) => item.barcode)?.name).toBe('Mon nom privé');
  screen.getByText(/Nom privé conservé, proposition publique non acceptée/);
});

it('ignores late community suggestions after a local rename', async () => {
  jest.mocked(getProduct).mockRejectedValue(new BackendApiError('Not found', 404, 'test'));
  const pending = deferred<Awaited<ReturnType<typeof getCommunitySuggestions>>>();
  jest.mocked(getCommunitySuggestions).mockReturnValue(pending.promise);
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByLabelText('Ajouter un article'));
  fireEvent.press(screen.getByLabelText('Scanner un code-barres'));
  await act(async () => { fireEvent.press(screen.getByText('Simuler scan')); });
  fireEvent(screen.getByTestId('scanner-modal'), 'requestClose');
  const scanned = mockItems.get('home')!.find((item) => item.barcode)!;
  fireEvent.press(screen.getByTestId(`rename-${scanned.id}`));
  await act(async () => pending.resolve({ barcode: scanned.barcode!, suggestions: [] }));
  expect(screen.queryByLabelText('Nom du produit scanné')).toBeNull();
  expect(getProductPreference(scanned.barcode!)?.name).toBe('Pain');
});

it('can defer naming without deleting the product and prompts again on a deliberate rescan', async () => {
  jest.mocked(getProduct).mockRejectedValue(new BackendApiError('Not found', 404, 'test'));
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByLabelText('Ajouter un article'));
  fireEvent.press(screen.getByLabelText('Scanner un code-barres'));
  await act(async () => fireEvent.press(screen.getByText('Simuler scan')));
  fireEvent.press(screen.getByText('Plus tard'));
  expect(mockItems.get('home')!.find((item) => item.barcode)?.name).toBe('Produit 3017620422003');
  expect(getProductPreference('3017620422003')).toBeNull();
  await act(async () => fireEvent.press(screen.getByText('Simuler scan')));
  screen.getByLabelText('Nom du produit scanné');
  expect(mockItems.get('home')!.find((item) => item.barcode)?.quantity).toBe(2);
});

it('waits for an in-flight lookup before proposing a name on a repeated scan', async () => {
  const request = deferred<Awaited<ReturnType<typeof getProduct>>>();
  jest.mocked(getProduct).mockReturnValue(request.promise);
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByLabelText('Ajouter un article'));
  fireEvent.press(screen.getByLabelText('Scanner un code-barres'));
  fireEvent.press(screen.getByText('Simuler scan'));
  fireEvent.press(screen.getByText('Simuler scan'));
  expect(screen.queryByLabelText('Nom du produit scanné')).toBeNull();
  expect(getProduct).toHaveBeenCalledTimes(1);
  await act(async () => request.reject(new Error('offline')));
  screen.getByLabelText('Nom du produit scanné');
  expect(mockItems.get('home')!.find((item) => item.barcode)?.quantity).toBe(2);
});
