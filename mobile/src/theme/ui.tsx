import React, { forwardRef } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable as NativePressable, Text as NativeText,
  TextInput as NativeInput, ScrollView, View, type TextProps, type TextInputProps, type PressableProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from './ThemeProvider';

export function Text({ style, ...props }: TextProps) {
  const { theme } = useTheme();
  return <NativeText {...props} style={[{ color: theme.text, fontSize: theme.bodySize, lineHeight: theme.bodySize * 1.45 }, style]} />;
}
export function Heading({ style, ...props }: TextProps) {
  const { theme, headingFont } = useTheme();
  return <Text {...props} style={[{ fontSize: theme.id === 'pixel' ? 24 : 28, lineHeight: 36,
    fontWeight: headingFont ? '400' : '700', fontFamily: headingFont }, style]} />;
}
export const TextInput = forwardRef<NativeInput, TextInputProps>(function TextInput({ style, ...props }, ref) {
  const { theme } = useTheme();
  return <NativeInput ref={ref} placeholderTextColor={theme.muted} selectionColor={theme.primary}
    {...props} style={[{ color: theme.text, backgroundColor: theme.surface, fontSize: theme.bodySize,
      borderColor: theme.border, borderWidth: theme.stroke, borderRadius: theme.radius, padding: 14, minHeight: 52 }, style]} />;
});
// Shared targets also cover legacy secondary controls during the visual migration.
export function Pressable({ style, ...props }: PressableProps) {
  const { theme } = useTheme();
  return <NativePressable accessibilityRole="button" {...props} style={(state) => [
    { minHeight: theme.tap, minWidth: theme.tap, justifyContent: 'center', opacity: props.disabled ? 0.5 : state.pressed ? 0.72 : 1 },
    typeof style === 'function' ? style(state) : style,
  ]} />;
}
export function Button({ label, variant = 'primary', ...props }: Omit<PressableProps, 'children'> & {
  label: string; variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}) {
  const { theme } = useTheme();
  return <Pressable {...props} style={[{ borderRadius: theme.radius, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: variant === 'primary' ? theme.primary : variant === 'secondary' ? theme.raised : 'transparent',
    borderWidth: variant === 'secondary' ? theme.stroke : 0, borderColor: theme.border,
    alignItems: 'center', minHeight: theme.tap + 4 }, props.style as object]}>
    <Text style={{ color: variant === 'primary' ? theme.onPrimary : variant === 'danger' ? theme.danger : theme.text,
      fontWeight: '700', textAlign: 'center' }}>{label}</Text>
  </Pressable>;
}
export function PageModal({ title, onClose, children, testID, showBackButton = true }: React.PropsWithChildren<{ title: string; onClose: () => void; testID?: string; showBackButton?: boolean }>) {
  const { theme } = useTheme();
  return <Modal visible animationType="none" presentationStyle="fullScreen" onRequestClose={onClose} testID={testID}>
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 4 }}>
          {showBackButton ? <Pressable onPress={onClose} accessibilityLabel={`Fermer ${title}`} style={{ alignSelf: 'flex-start' }}>
            <Text style={{ color: theme.muted }}>← Retour</Text>
          </Pressable> : null}<Heading>{title}</Heading>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 20 }}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
