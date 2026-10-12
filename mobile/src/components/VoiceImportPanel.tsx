import React, { useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, View } from 'react-native';
import { Button, PageModal, Text, TextInput } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { localSpeech, speechErrorMessage } from '@/services/localSpeech';
import { prepareVoiceItems } from '@/services/voiceItems';
import { parseOcrItems, type OcrItem } from '@/services/ocrItems';

export function VoiceImportPanel({ onCancel, onImport, embedded = false, active = true }: {
  onCancel: () => void; onImport: (items: OcrItem[]) => void; embedded?: boolean; active?: boolean;
}) {
  const { theme } = useTheme();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [stage, setStage] = useState<'idle' | 'starting' | 'listening' | 'finishing'>('idle');
  const [transcript, setTranscript] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const importing = useRef(false);
  const listening = stage !== 'idle';

  useEffect(() => {
    let mounted = true;
    void localSpeech.isAvailable().then((value) => { if (mounted) setAvailable(value); });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && busy.current) {
        generation.current++; busy.current = false;
        void localSpeech.cancel().catch(() => {});
        setStage('idle'); setError('Dictée interrompue à la sortie de l’application. Tu peux recommencer.');
      }
    });
    return () => {
      mounted = false; generation.current++; busy.current = false;
      subscription.remove(); void localSpeech.cancel().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!active) {
      generation.current++; busy.current = false;
      void localSpeech.cancel().catch(() => {});
      setStage('idle');
    }
  }, [active]);

  function cancel() {
    generation.current++; busy.current = false;
    void localSpeech.cancel().catch(() => {});
    onCancel();
  }

  async function dictate() {
    if (!active || busy.current || !available) return;
    busy.current = true;
    const current = ++generation.current;
    setError(null); setStage('starting');
    try {
      const granted = await localSpeech.requestPermission();
      if (current !== generation.current) return;
      if (!granted) throw { code: 'E_PERMISSION' };
      setStage('listening');
      const recognized = await localSpeech.recognize();
      if (current !== generation.current) return;
      const prepared = prepareVoiceItems(recognized);
      if (!prepared) throw { code: 'E_NO_SPEECH' };
      setTranscript(recognized); setText(prepared);
    } catch (failure) {
      if (current === generation.current) setError(speechErrorMessage(failure));
    } finally {
      if (current === generation.current) { busy.current = false; setStage('idle'); }
    }
  }

  async function stop() {
    const current = generation.current;
    setStage('finishing');
    try { await localSpeech.stop(); }
    catch (failure) {
      if (current !== generation.current) return;
      generation.current++; busy.current = false; setStage('idle');
      void localSpeech.cancel().catch(() => {}); setError(speechErrorMessage(failure));
    }
  }

  function confirm() {
    if (!active || busy.current || importing.current) return;
    importing.current = true;
    try { onImport(parseOcrItems(text)); }
    catch (failure) {
      importing.current = false;
      setError(failure instanceof Error ? failure.message : 'Impossible d’ajouter ces articles.');
    }
  }

  if (!active) return null;
  const content = <>
    <Text>Reconnaissance locale Android · Français</Text>
    <Text style={{ color: theme.muted }}>Ta voix est traitée sur cet appareil, sans service en ligne. Poduna ne conserve aucun enregistrement audio.</Text>
    {available === null ? <Text accessibilityLiveRegion="polite">Vérification du moteur local…</Text> : available === false ?
      <Text accessibilityRole="alert">La dictée locale n’est pas disponible sur cet appareil ou dans cette version de l’app. Elle nécessite Android 12 minimum et un moteur vocal local compatible. Tu peux continuer avec la saisie manuelle.</Text> : <>
      <Text>Dis par exemple « deux oranges, puis du lait, puis trois yaourts ». Pour séparer les produits, dis « puis ». Les poids et les marques sont à relire.</Text>
      <Text accessibilityLiveRegion="polite">{stage === 'starting' ? 'Préparation du microphone…' : stage === 'listening' ? 'Écoute en cours…' : stage === 'finishing' ? 'Fin de la reconnaissance…' : 'Le microphone est arrêté.'}</Text>
      {stage === 'listening' ? <Button label="Terminer la dictée" onPress={() => void stop()} /> :
        <Button label={text ? 'Recommencer la dictée' : 'Commencer la dictée'} disabled={listening} onPress={() => void dictate()} />}
      {text ? <Text style={{ color: theme.muted, fontSize: 14 }}>Une nouvelle dictée réussie remplacera ce brouillon.</Text> : null}
    </>}
    {transcript ? <View style={{ gap: 6 }}><Text style={{ fontWeight: '700' }}>Texte entendu</Text><Text>{transcript}</Text></View> : null}
    {text || transcript ? <View style={{ gap: 12 }}>
      <Text style={{ fontWeight: '700' }}>Vérifier les articles</Text>
      <Text>Un article par ligne, « 2 x lait » pour une quantité. Corrige les séparations, noms et quantités : aucun ajout sans ta validation.</Text>
      <TextInput accessibilityLabel="Articles dictés à vérifier" multiline textAlignVertical="top" style={{ minHeight: 160 }} maxLength={20000}
        editable={!listening} value={text} onChangeText={(value) => { setText(value); setError(null); }} />
      <Button label="Ajouter les articles à la liste" disabled={listening || !text.trim()} onPress={confirm} />
    </View> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
    <Button variant="ghost" label="Retour à l’ajout manuel" onPress={cancel} />
  </>;
  return embedded ? <ScrollView testID="voice-panel" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 20 }}>{content}</ScrollView>
    : <PageModal title="Dicter des articles" onClose={cancel}>{content}</PageModal>;
}
