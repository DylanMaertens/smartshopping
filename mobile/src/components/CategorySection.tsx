import React from 'react';
import { Text, View } from 'react-native';
import { ShoppingItem } from '@/components/ShoppingItem';
import type { CategorySection as CategorySectionType } from '@/types';

type Props = {
  section: CategorySectionType;
  onToggleItem: (id: string) => void;
};

export function CategorySection({ section, onToggleItem }: Props) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '700' }}>{section.categoryName}</Text>
      {section.items.map((item) => (
        <ShoppingItem key={item.id} item={item} onToggle={onToggleItem} />
      ))}
    </View>
  );
}
