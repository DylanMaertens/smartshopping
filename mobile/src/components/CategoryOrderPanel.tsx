import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, ScrollView, View, useWindowDimensions } from 'react-native';
import { Heading, Pressable, Text } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { STORE_CATEGORIES } from '@/services/categorization/categoryService';
import { defaultCategoryOrder, moveCategory, normalizeCategoryOrder } from '@/services/categorization/categoryOrder';


const names = new Map(STORE_CATEGORIES.map((category) => [category.id, category.name]));
type Props = { order: string[]; onSave: (order: string[]) => void; onCancel: () => void };
type Drag = { id: string; from: number; dy: number };

export function CategoryOrderPanel({ order, onSave, onCancel }: Props) {
  const { theme } = useTheme();
  const { fontScale, width } = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.3;
  const rowHeight = Math.ceil((compact ? 104 : 76) * Math.max(1, fontScale) * theme.bodySize / 16);
  const [draft, setDraft] = useState(() => normalizeCategoryOrder(order));
  const [drag, setDrag] = useState<Drag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDragging = (next: Drag | null) => { dragRef.current = next; setDrag(next); };
  const move = (id: string, position: number) => { setError(null); setDraft((current) => moveCategory(current, id, position)); };
  const target = drag ? Math.max(0, Math.min(draft.length - 1, drag.from + Math.round(drag.dy / rowHeight))) : null;

  function finishDrag(commit: boolean) {
    const current = dragRef.current;
    if (current && commit) move(current.id, current.from + Math.round(current.dy / rowHeight));
    setDragging(null);
  }

  return <View style={{ flex: 1, padding: 20, gap: 12 }}>
    <Heading accessibilityRole="header" style={{ fontSize: 24 }}>Ordre des rayons</Heading>
    <>{fontScale <= 1.3 ? <Text>Glisse la poignée ☰ ou utilise les flèches.</Text> : null}</>
    <Text style={{ color: theme.muted }}>Pour cette liste, sur cet appareil.</Text>
    <Text accessibilityLiveRegion="polite" style={{ color: theme.primary, minHeight: 20 }}>
      {drag ? `${names.get(drag.id)} : déposer en position ${target! + 1}` : 'Du premier au dernier rayon'}
    </Text>
    <ScrollView testID="category-order-scroll" scrollEnabled={!drag} style={{ flex: 1 }}>
      <View style={{ height: draft.length * rowHeight }}>
        {draft.map((id, index) => <OrderRow key={id} id={id} index={index} total={draft.length} rowHeight={rowHeight} compact={compact}
          dragging={drag?.id === id} dy={drag?.id === id ? drag.dy : 0}
          target={target === index} locked={!!drag}
          onMove={(position) => move(id, position)}
          onStart={() => setDragging({ id, from: index, dy: 0 })}
          onDrag={(dy) => {
            const current = dragRef.current;
            if (current?.id === id) setDragging({ ...current, dy: Math.max(-current.from * rowHeight, Math.min((draft.length - 1 - current.from) * rowHeight, dy)) });
          }}
          onEnd={finishDrag} />)}
      </View>
    </ScrollView>
    {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
    <Pressable accessibilityRole="button" disabled={!!drag} onPress={() => { setDraft(defaultCategoryOrder()); setError(null); }} style={{ padding: 12 }}>
      <Text style={{ textAlign: 'center' }}>Ordre par défaut</Text>
    </Pressable>
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Pressable accessibilityRole="button" onPress={onCancel} style={{ flex: 1, padding: 14, borderRadius: theme.radius, backgroundColor: theme.raised }}>
        <Text style={{ textAlign: 'center' }}>Annuler</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={!!drag} onPress={() => {
        try { onSave(draft); } catch { setError('Impossible de sauvegarder cet ordre. Réessaie.'); }
      }} style={{ flex: 1, padding: 14, borderRadius: theme.radius, backgroundColor: theme.primary }}>
        <Text style={{ color: theme.onPrimary, textAlign: 'center', fontWeight: '700' }}>Enregistrer</Text>
      </Pressable>
    </View>
  </View>;
}

type RowProps = {
  rowHeight: number; compact: boolean; id: string; index: number; total: number; dragging: boolean; dy: number; target: boolean; locked: boolean;
  onMove: (position: number) => void; onStart: () => void; onDrag: (dy: number) => void; onEnd: (commit: boolean) => void;
};
function OrderRow(props: RowProps) {
  const { theme } = useTheme();
  const latest = useRef(props);
  latest.current = props;
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !latest.current.locked,
    onPanResponderGrant: () => latest.current.onStart(),
    onPanResponderMove: (_, gesture) => latest.current.onDrag(gesture.dy),
    onPanResponderRelease: () => latest.current.onEnd(true),
    onPanResponderTerminate: () => latest.current.onEnd(false),
    onPanResponderTerminationRequest: () => false,
  }), []);
  const { rowHeight, compact, id, index, total, dragging, dy, target, locked, onMove } = props;
  const name = names.get(id)!;
  return <View testID={`category-order-row-${id}`} style={{
    position: 'absolute', top: index * rowHeight, left: 0, right: 0, height: rowHeight - 4,
    flexDirection: 'row', alignItems: 'center', borderRadius: theme.radius, borderWidth: target ? 2 : 1,
    borderColor: target ? theme.primary : theme.border, backgroundColor: dragging ? theme.raised : theme.surface,
    transform: [{ translateY: dy }], zIndex: dragging ? 10 : 0, elevation: dragging ? 6 : 0,
  }}>
    <View {...responder.panHandlers} testID={`category-drag-${id}`} accessible
      accessibilityRole="adjustable" accessibilityLabel={`Déplacer ${name}`}
      accessibilityValue={{ min: 1, max: total, now: index + 1 }}
      accessibilityActions={[{ name: 'increment', label: 'Descendre' }, { name: 'decrement', label: 'Monter' }]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (!locked && ['increment', 'decrement'].includes(nativeEvent.actionName)) onMove(index + (nativeEvent.actionName === 'increment' ? 1 : -1));
      }} style={{ padding: 16 }}><Text style={{ fontSize: 22 }}>☰</Text></View>
    <Text style={{ flex: 1, color: theme.text }}>{index + 1}. {name}</Text>
    <View style={{ flexDirection: compact ? 'column' : 'row' }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Monter ${name}`} disabled={locked || index === 0}
      onPress={() => onMove(index - 1)} style={{ alignItems: 'center', padding: 8, opacity: index === 0 ? 0.3 : 1 }}><Text>↑</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Descendre ${name}`} disabled={locked || index === total - 1}
      onPress={() => onMove(index + 1)} style={{ alignItems: 'center', padding: 8, opacity: index === total - 1 ? 0.3 : 1 }}><Text>↓</Text></Pressable>
    </View>
  </View>;
}
