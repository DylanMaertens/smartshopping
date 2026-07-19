import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ShoppingItem as ShoppingItemType } from '@/types';

type Props = {
  item: ShoppingItemType;
  onDecreaseQuantity: (id: string) => void;
  onIncreaseQuantity: (id: string) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
};

export function ShoppingItem({
  item,
  onDecreaseQuantity,
  onIncreaseQuantity,
  onRemove,
  onToggle,
}: Props) {
  return (
    <View
      style={{
        alignItems: 'center',
        borderColor: '#e2e8f0',
        borderRadius: 12,
        borderWidth: 1,
        flexDirection: 'row',
        gap: 12,
        padding: 12,
      }}
    >
      <Pressable
        onPress={() => onToggle(item.id)}
        style={{
          alignItems: 'center',
          backgroundColor: item.checked ? '#16a34a' : '#ffffff',
          borderColor: item.checked ? '#16a34a' : '#94a3b8',
          borderRadius: 10,
          borderWidth: 1,
          height: 24,
          justifyContent: 'center',
          width: 24,
        }}
      >
        {item.checked ? <Text style={{ color: '#ffffff', fontSize: 12 }}>✓</Text> : null}
      </Pressable>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 16,
            fontWeight: '600',
            textDecorationLine: item.checked ? 'line-through' : 'none',
          }}
        >
          {item.name}
        </Text>
        <Text style={{ color: '#64748b' }}>{item.quantity} × {item.category ?? 'À classer'}</Text>
      </View>

      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}>
        <Pressable
          onPress={() => onDecreaseQuantity(item.id)}
          style={{ backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
        >
          <Text style={{ fontWeight: '700' }}>−</Text>
        </Pressable>
        <Pressable
          onPress={() => onIncreaseQuantity(item.id)}
          style={{ backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
        >
          <Text style={{ fontWeight: '700' }}>+</Text>
        </Pressable>
        <Pressable
          onPress={() => onRemove(item.id)}
          style={{ backgroundColor: '#fee2e2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
        >
          <Text style={{ color: '#991b1b', fontWeight: '700' }}>×</Text>
        </Pressable>
      </View>
    </View>
  );
}
