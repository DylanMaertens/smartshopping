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

export type CategorySection = {
  categoryName: string;
  orderIndex: number;
  items: ShoppingItem[];
};
