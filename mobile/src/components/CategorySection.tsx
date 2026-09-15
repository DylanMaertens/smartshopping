import React from 'react';
import { Text, View } from 'react-native';
import { ShoppingItem } from '@/components/ShoppingItem';
import type { CategorySection as CategorySectionType } from '@/types';

type Props = {
  onDecreaseQuantity: (id: string) => void;
  onIncreaseQuantity: (id: string) => void;
  onRemoveItem: (id: string) => void;
  onToggleItem: (id: string) => void;
  section: CategorySectionType;
};

export function CategorySection({
  onDecreaseQuantity,
  onIncreaseQuantity,
  onRemoveItem,
  onToggleItem,
  section,
}: Props) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '700' }}>{section.categoryName}</Text>
      {section.items.map((item) => (
        <ShoppingItem
          key={item.id}
          item={item}
          onDecreaseQuantity={onDecreaseQuantity}
          onIncreaseQuantity={onIncreaseQuantity}
          onRemove={onRemoveItem}
          onToggle={onToggleItem}
        />
      ))}
    </View>
  );
}
