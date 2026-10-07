// Isolated UI fixtures. This preview never contacts the backend or reads device data.
let active = 'demo';
let lists = [{ id: 'demo', name: 'Courses de la semaine', createdAt: 1, updatedAt: 1 }, { id: 'weekend', name: 'Pour le week-end', createdAt: 1, updatedAt: 1 }];
const seed = [['Pommes', 'Fruits & légumes', 4], ['Tomates', 'Fruits & légumes', 1], ['Pain complet', 'Boulangerie', 1], ['Lait', 'Crémerie & produits laitiers', 2], ['Eau pétillante', 'Boissons', 1], ['Café', 'Épicerie sucrée & petit-déjeuner', 1]];
const items = new Map<string, any[]>([['demo', seed.map(([name, category, quantity], i) => ({ id: String(i), listId: 'demo', name, category, quantity, checked: i === 5, updatedAt: 1, syncedAt: 1 }))], ['weekend', []]]);
const orders = new Map();
const sharedLists = new Set<string>();
export const ShoppingListStorage = {
  isSyncEnabled: (id: string) => sharedLists.has(id), enableSyncForSharing: (id: string) => { sharedLists.add(id); },
  isSyncDisabled: () => false, disableSync: () => {},
  createBackup: () => ({ format: 'smartshopping-lists', version: 1, backupId: crypto.randomUUID(), createdAt: new Date().toISOString(),
    lists: lists.map((list) => ({ name: list.name, categoryOrder: orders.get(list.id) ?? [], items: (items.get(list.id) ?? []).filter((i) => !i.deletedAt)
      .map(({ name, quantity, checked, category }) => ({ name, quantity, checked, category })) })) }),
  restoreBackup: (backup: any) => backup.lists.map((source: any) => {
    const id = crypto.randomUUID(); lists = [...lists, { id, name: source.name, createdAt: 1, updatedAt: 1 }];
    items.set(id, source.items.map((entry: any) => ({ ...entry, id: crypto.randomUUID(), listId: id, updatedAt: 1, syncedAt: 1 })));
    orders.set(id, source.categoryOrder); return id;
  }),
  getLists: () => lists, getActiveListId: () => active, setActiveList: (id: string) => { active = id; },
  getCurrentList: (id = active) => items.get(id) ?? [], getPendingChanges: (id: string) => (items.get(id) ?? []).filter((i) => i.updatedAt > (i.syncedAt ?? 0)),
  getLastSyncTimestamp: () => Date.now(), getCategoryOrder: (id: string) => orders.get(id) ?? [], saveCategoryOrder: (id: string, value: string[]) => orders.set(id, value),
  saveCurrentList: (id: string, value: any[]) => items.set(id, value),
  getPendingListName: () => undefined,
  getPendingChangesCount: (id: string) => (items.get(id) ?? []).filter((i) => i.updatedAt > (i.syncedAt ?? 0)).length,
  completeSync: (id: string) => { const synced = (items.get(id) ?? []).map((i) => ({ ...i, syncedAt: i.updatedAt })); items.set(id, synced); return synced; },
  clearCurrentList: (id: string) => { items.set(id, []); return []; },
  createList: (name: string) => { const list = { id: String(Date.now()), name, createdAt: 1, updatedAt: 1 }; lists = [...lists, list]; return list; },
  renameList: (id: string, name: string) => { lists = lists.map((l) => l.id === id ? { ...l, name } : l); },
  archiveList: (id: string) => { lists = lists.filter((l) => l.id !== id); if (active === id) active = lists[0].id; return active; },
  importSharedList: (id: string) => { sharedLists.add(id); }, deleteListPermanently: () => 'demo',
};
const engine = { syncListIfOnline: async () => ({ synced: true, response: { server_time: Date.now(), conflicts: [] }, remoteItems: [] }) };
const networkState = { isConnected: true, isInternetReachable: true };
export const useOfflineSync = () => ({ networkState, syncEngine: engine });
export class LocalKeyValueStorage {
  static getString(key: string) { return localStorage.getItem('preview.' + key); }
  static setString(key: string, value: string) { localStorage.setItem('preview.' + key, value); }
}
export class BackendApiError extends Error {}
export const getCommunitySuggestions = async (barcode: string) => ({ barcode, suggestions: [], contributions_enabled: false });
export const getValidatedCommunityFields = async (barcode: string) => ({ barcode, fields: [], contributions_enabled: false });
export const submitCommunityProposal = async () => ({ proposal_ids: [], publication_status: 'received' });
export const confirmCommunityProposal = async () => {};
export const reportCommunityProposal = async () => {};
export const getProduct = async () => ({ product_name: 'Chocolat', categories: [] });
export const recognizeListPhoto = async () => ({ text: 'Pommes\n2 x lait\nPain complet' });
export const createListInvitation = async (_deviceId: string, listId: string) => ({ code: 'a'.repeat(32), list_id: listId, expires_at: Date.now() + 86_400_000 });
export const deleteSharedList = async () => {};
export const getListMembers = async () => [];
export const joinListInvitation = async () => ({ list_id: 'demo' });
export const removeListMember = async () => {};
export const revokeListInvitation = async () => {};
export const getAnonymousDeviceId = async () => 'preview';
export const rotateAnonymousDeviceId = async () => {};
export const runDeviceStorageDiagnostics = () => [{ name: 'Aperçu visuel', passed: true, detail: 'Données fictives, sans accès au stockage de l’app.' }];

export const canConfigureTestServer = () => false;
export const getTestServerUrl = () => null;
export const verifyAndSaveTestServer = async () => { throw new Error("Preview only"); };
export const reloadAppAsync = async () => {};
