import React from 'react';
import { View } from 'react-native';
import { Text } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { ShoppingItem } from '@/components/ShoppingItem';
import type { CategorySection as CategorySectionType } from '@/types';

type Props = {
  notebook?: boolean;
  showCategories?: boolean;
  getItemBarcodes?: (id: string) => string[];
  onDecreaseQuantity: (id: string) => void;
  onIncreaseQuantity: (id: string) => void;
  onRenameItem: (id: string, name: string, category?: string) => void;
  onRemoveItem: (id: string) => void;
  onToggleItem: (id: string) => void;
  section: CategorySectionType;
};

export function CategorySection({
  notebook = false,
  showCategories = true,
  getItemBarcodes,
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
    <View style={{ gap: notebook ? 0 : 8 }}>
      {showCategories ? <View testID="category-heading" style={{ backgroundColor: notebook ? 'transparent' : tint, borderRadius: notebook ? 0 : theme.radius / 2, paddingHorizontal: 12, paddingVertical: 6 }}><Text accessibilityRole="header" style={{ color: theme.text, fontSize: theme.bodySize, fontWeight: headingFont ? '400' : '700', fontFamily: headingFont }}>{section.categoryName}</Text></View> : null}
      {section.items.map((item) => (
        <ShoppingItem
          key={item.id}
          item={item}
          notebook={notebook}
          communityBarcodes={getItemBarcodes?.(item.id)}
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
