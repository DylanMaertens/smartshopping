import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Heading, Pressable, Text, TextInput } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { BarcodeScannerPanel } from './BarcodeScannerPanel';
import { BackendApiError, recognizeListPhoto } from '@/services/api/backend';
import { cleanOcrText, parseOcrItems, type OcrItem } from '@/services/ocrItems';
import { applyOcrCorrection, suggestOcrCorrections } from '@/services/ocrSpelling';

type Props = { onCancel: () => void; onImport: (items: OcrItem[]) => void };
export function OcrImportPanel({ onCancel, onImport }: Props) {
  const { theme } = useTheme();
  const [stage, setStage] = useState<'camera' | 'reading' | 'review'>('camera');
  const [photo, setPhoto] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [checkingSpelling, setCheckingSpelling] = useState(false);
  const suggestions = useMemo(() => checkingSpelling ? suggestOcrCorrections(text) : [], [text, checkingSpelling]);
  const mounted = useRef(true);
  const busy = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { shown.remove(); hidden.remove(); };
  }, []);

  async function recognize(base64: string) {
    if (busy.current) return;
    busy.current = true;
    setError(null); setPhoto(`data:image/jpeg;base64,${base64}`); setStage('reading');
    try {
      const result = await recognizeListPhoto(base64);
      if (!mounted.current) return;
      setText(cleanOcrText(result.text));
      if (!cleanOcrText(result.text)) setError('Aucun texte reconnu. Reprends une photo plus nette ou saisis les articles ci-dessous.');
    } catch (failure) {
      if (!mounted.current) return;
      const message = failure instanceof BackendApiError && failure.status === 429
        ? 'La reconnaissance est occupée. Réessaie dans quelques secondes.'
        : failure instanceof BackendApiError && failure.status === 503
        ? 'Le moteur OCR n’est pas disponible sur le serveur.'
        : failure instanceof BackendApiError && failure.status === 404
        ? 'Le serveur doit être mis à jour et redémarré pour activer la reconnaissance.'
        : failure instanceof BackendApiError && [400, 413].includes(failure.status)
        ? 'La photo est trop grande ou illisible. Reprends une photo en cadrant uniquement les articles.'
        : failure instanceof BackendApiError && failure.status === 504
        ? 'La lecture a pris trop de temps. Essaie avec une partie plus courte de la liste.'
        : 'Reconnaissance impossible. Vérifie la connexion au serveur, puis reprends la photo.';
      setError(message);
    } finally {
      busy.current = false;
      if (mounted.current) setStage('review');
    }
  }

  function confirm() {
    if (busy.current) return;
    busy.current = true;
    try { onImport(parseOcrItems(text)); }
    catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Impossible d’ajouter ces articles.');
      busy.current = false;
    }
  }

  if (stage === 'camera') return <BarcodeScannerPanel mode="text" onScanned={() => {}}
    onPhotographed={(base64) => void recognize(base64)} onCancel={onCancel} />;
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 24, gap: 16 }}>
    <Heading style={{ fontSize: 24 }}>{stage === 'reading' ? 'Lecture de la photo…' : 'Vérifier les articles'}</Heading>
    <Pressable accessibilityRole="button" onPress={onCancel}><Text>Annuler</Text></Pressable>
    {stage === 'reading' ? <ActivityIndicator accessibilityLabel="Reconnaissance en cours" /> : <>
      {!keyboardVisible ? <>
        {photo ? <Image source={{ uri: photo }} accessibilityLabel="Photo de la liste à relire" resizeMode="contain" style={{ height: 180, borderRadius: theme.radius, backgroundColor: theme.raised }} /> : null}
        <Text>Corrige les mots et retire les lignes inutiles avant l’ajout. Un article par ligne ; « 2 x lait » pour une quantité. Aucun ajout sans ta validation.</Text>
      </> : null}
      <TextInput multiline scrollEnabled autoCorrect spellCheck autoCapitalize="sentences" accessibilityLabel="Articles reconnus" value={text} onChangeText={(value) => { setText(value); setError(null); }}
        maxLength={20000} textAlignVertical="top" style={{ height: keyboardVisible ? 150 : 240, padding: 12, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius }} />
      {keyboardVisible ? <Pressable accessibilityRole="button" onPress={() => Keyboard.dismiss()}><Text>Terminer la correction</Text></Pressable> : null}
      <Pressable accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setCheckingSpelling((value) => !value); }}>
        <Text>{checkingSpelling ? 'Masquer les suggestions' : 'Vérifier l’orthographe'}</Text>
      </Pressable>
      {checkingSpelling ? <View style={{ gap: 8 }}>
        <Text>{suggestions.length ? 'Suggestions à valider une par une. Tu peux garder les noms et marques tels quels.' : 'Aucune autre suggestion. Relis les noms et les marques avant l’ajout.'}</Text>
        {suggestions.map((suggestion) => <Pressable key={suggestion.start} accessibilityRole="button"
          accessibilityLabel={`Remplacer ${suggestion.original} par ${suggestion.replacement}`}
          onPress={() => setText((current) => applyOcrCorrection(current, suggestion))}
          style={{ padding: 12, backgroundColor: theme.raised, borderRadius: theme.radius }}>
          <Text>{suggestion.original} → {suggestion.replacement}</Text>
        </Pressable>)}
      </View> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
      <Pressable accessibilityRole="button" disabled={!text.trim()} onPress={confirm}
        style={{ backgroundColor: theme.primary, borderRadius: theme.radius, padding: 14 }}>
        <Text style={{ color: theme.onPrimary, fontWeight: '700', textAlign: 'center' }}>Ajouter les {text.split(/\r?\n/).filter((line) => line.trim()).length} lignes</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => { setError(null); setPhoto(null); setText(''); setCheckingSpelling(false); setStage('camera'); }}><Text>Reprendre une photo</Text></Pressable>
    </>}
  </ScrollView></KeyboardAvoidingView>;
}
