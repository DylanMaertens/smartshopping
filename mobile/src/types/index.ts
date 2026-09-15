export type ShoppingItem = {
  id: string;
  listId: string;
  name: string;
  barcode?: string;
  category?: string;
  quantity: number;
  checked: boolean;
  updatedAt: number;
  syncedAt?: number;
  deletedAt?: number;
};

export type ShoppingList = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type CategorySection = {
  categoryName: string;
  orderIndex: number;
  items: ShoppingItem[];
};
