import React from 'react';
import { View } from 'react-native';
import { Text } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { ShoppingItem } from '@/components/ShoppingItem';
import type { CategorySection as CategorySectionType } from '@/types';

type Props = {
  onDecreaseQuantity: (id: string) => void;
  onIncreaseQuantity: (id: string) => void;
  onRenameItem: (id: string, name: string, category?: string) => void;
  onRemoveItem: (id: string) => void;
  onToggleItem: (id: string) => void;
  section: CategorySectionType;
};

export function CategorySection({
  onDecreaseQuantity,
  onIncreaseQuantity,
  onRenameItem,
  onRemoveItem,
  onToggleItem,
  section,
}: Props) {
  const { theme, headingFont } = useTheme();
  const tint = theme.id === 'pastel' ? ['#E2F1E7', '#FBEADD', '#EEE4FA'][section.orderIndex % 3] : theme.raised;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ backgroundColor: tint, borderRadius: theme.radius / 2, paddingHorizontal: 12, paddingVertical: 10 }}><Text accessibilityRole="header" style={{ color: theme.text, fontSize: theme.bodySize, fontWeight: headingFont ? '400' : '700', fontFamily: headingFont }}>{section.categoryName}</Text></View>
      {section.items.map((item) => (
        <ShoppingItem
          key={item.id}
          item={item}
          onDecreaseQuantity={onDecreaseQuantity}
          onIncreaseQuantity={onIncreaseQuantity}
          onRemove={onRemoveItem}
          onRename={onRenameItem}
          onToggle={onToggleItem}
        />
      ))}
    </View>
  );
}
