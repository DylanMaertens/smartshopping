import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { reloadAppAsync } from 'expo';
import { Button, Text, TextInput } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { canConfigureTestServer, getTestServerUrl, verifyAndSaveTestServer } from '@/services/api/testServer';

export function TestServerCard() {
  const { theme } = useTheme();
  const [url, setUrl] = useState(() => getTestServerUrl() ?? '');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!canConfigureTestServer()) return null;
  async function save() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage(null);
    try {
      const saved = await verifyAndSaveTestServer(url);
      setUrl(saved);
      setMessage('Adresse enregistrée. L’app va redémarrer pour se connecter.');
      try { await reloadAppAsync(); }
      catch { setMessage('Adresse enregistrée. Ferme complètement l’app puis rouvre-la pour te connecter.'); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Configuration impossible.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <View style={{ gap: 12, padding: 16, borderRadius: theme.radius, backgroundColor: theme.surface }}>
    <Text style={{ fontWeight: '700' }}>Serveur de test</Text>
    <Text style={{ color: theme.muted }}>Colle l’adresse HTTPS affichée sur ton PC pour activer le partage, la synchronisation et la lecture des listes écrites. Sans serveur, tes listes restent utilisables sur cet appareil.</Text>
    <TextInput accessibilityLabel="Adresse HTTPS du serveur" placeholder="https://…trycloudflare.com" value={url}
      onChangeText={setUrl} editable={!busy} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
    <Text style={{ color: theme.muted, fontSize: 13 }}>Utilise uniquement l’adresse de ton serveur SmartShopping. Change-la ici lorsque le tunnel redémarre.</Text>
    <Button label={busy ? 'Vérification…' : 'Connecter et redémarrer'} disabled={busy || !url.trim()} onPress={() => void save()} />
    {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
  </View>;
}
