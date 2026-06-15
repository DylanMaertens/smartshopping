import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { STORE_CATEGORIES } from '@/services/categorization/categoryService';

export function HomeScreen() {
  const visibleCategories = STORE_CATEGORIES.filter((category) => category.id !== 'non-categorise');

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 28, fontWeight: '700' }}>SmartShopping</Text>
        <Text style={{ color: '#475569', fontSize: 16 }}>
          Socle offline-first prêt pour créer et classer une liste de courses par rayons.
        </Text>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 20, fontWeight: '600' }}>Rayons magasin</Text>
        {visibleCategories.map((category) => (
          <View
            key={category.id}
            style={{
              borderColor: '#e2e8f0',
              borderRadius: 12,
              borderWidth: 1,
              padding: 12,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '600' }}>{category.name}</Text>
            <Text style={{ color: '#64748b' }}>Ordre rayon #{category.orderIndex}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
