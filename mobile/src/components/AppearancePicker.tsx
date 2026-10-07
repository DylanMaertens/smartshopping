import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { themeIds, themes } from '@/theme/themes';
import { Text, Pressable } from '@/theme/ui';
export function AppearancePicker() {
  const { theme, selectTheme, error } = useTheme();
  return <View style={{ gap: 12 }}>
    <Text style={{ fontWeight: '700', fontSize: 20 }}>Apparence</Text>
    <Text style={{ color: theme.muted }}>{themeIds.length} ambiances, les mêmes habitudes.</Text>
    {themeIds.map((id) => {
      const option = themes[id]; const selected = theme.id === id;
      return <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: selected }} aria-checked={selected}
        accessibilityLabel={option.name} onPress={() => selectTheme(id)}
        style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14, borderRadius: theme.radius,
          backgroundColor: theme.surface, borderWidth: selected ? 2 : 1, borderColor: selected ? theme.primary : theme.border }}>
        <View style={{ backgroundColor: option.bg, borderColor: option.border, borderWidth: 1, width: 48, height: 52,
          borderRadius: option.radius / 2, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ backgroundColor: option.primary, width: 26, height: 10, borderRadius: option.radius / 3 }} />
        </View>
        <View style={{ flex: 1 }}><Text style={{ fontWeight: '700' }}>{option.name}</Text><Text style={{ color: theme.muted, fontSize: 14 }}>{option.description}</Text></View>
        <Text accessibilityElementsHidden>{selected ? '✓' : '○'}</Text>
      </Pressable>;
    })}
    {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
  </View>;
}
