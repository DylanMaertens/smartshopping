import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ShoppingItem as ShoppingItemType } from '@/types';

type Props = {
  item: ShoppingItemType;
  onToggle: (id: string) => void;
};

export function ShoppingItem({ item, onToggle }: Props) {
  return (
    <Pressable
      onPress={() => onToggle(item.id)}
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
      <View
        style={{
          alignItems: 'center',
          backgroundColor: item.checked ? '#16a34a' : '#ffffff',
          borderColor: item.checked ? '#16a34a' : '#94a3b8',
          borderRadius: 10,
          borderWidth: 1,
          height: 20,
          justifyContent: 'center',
          width: 20,
        }}
      >
        {item.checked ? <Text style={{ color: '#ffffff', fontSize: 12 }}>✓</Text> : null}
      </View>
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
    </Pressable>
  );
}
