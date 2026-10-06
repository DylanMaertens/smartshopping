import React, { useEffect, useRef, useState } from 'react';
import { AppState, Linking, ScrollView, View } from 'react-native';
import { Heading, Pressable, Text } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { parseInvitationCode } from '@/services/api/invitationCode';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { BarcodeScanGate, SCAN_COOLDOWN_MS } from '@/services/barcodeScanGate';

type Props = {
  mode?: 'product' | 'invitation' | 'text';
  onPhotographed?: (base64: string) => void;
  onCancel: () => void;
  onScanned: (barcode: string) => void;
  statusMessage?: string | null;
  paused?: boolean;
};

export function BarcodeScannerPanel({ onCancel, onScanned, mode = 'product', onPhotographed, statusMessage, paused = false }: Props) {
  const { theme } = useTheme();
  const textMode = mode === 'text';
  const cameraRef = useRef<CameraView>(null);
  const [pictureSize, setPictureSize] = useState<string>();
  const [capturing, setCapturing] = useState(false);
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const scanGate = useRef(new BarcodeScanGate());
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [coolingDown, setCoolingDown] = useState(false);
  const [lastProduct, setLastProduct] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const invitation = mode === 'invitation';
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [torch, setTorch] = useState(false);
  const [active, setActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');

  useEffect(() => () => { if (cooldownTimer.current) clearTimeout(cooldownTimer.current); }, []);
  useEffect(() => { if (paused) scanGate.current.resetCandidate(); }, [paused]);

  function pauseScanning() {
    scanGate.current.pause(Date.now());
    setCoolingDown(true);
    if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    cooldownTimer.current = setTimeout(() => setCoolingDown(false), SCAN_COOLDOWN_MS);
  }

  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      setActive(state === 'active');
      if (state === 'active') {
        // Permissions may have changed in Android's settings screen.
        void refreshPermission().catch(() => setPermissionError('Impossible de vérifier l’autorisation caméra.'));
      } else {
        scanGate.current.resetCandidate();
        setCameraReady(false);
        setTorch(false);
      }
    });
    return () => listener.remove();
  }, [refreshPermission]);

  async function allowCamera() {
    setPermissionError(null);
    try {
      if (permission?.canAskAgain === false) await Linking.openSettings();
      else await requestPermission();
    } catch {
      setPermissionError('Impossible d’ouvrir les permissions. Autorise la caméra dans les paramètres d’Expo Go ou de SmartShopping.');
    }
  }

  function restartCamera() {
    scanGate.current.resetCandidate();
    lockedRef.current = false;
    setLocked(false);
    setCameraError(null);
    setScanError(null);
    setCameraReady(false);
    setTorch(false);
    setCameraAttempt((current) => current + 1);
  }

  async function prepareCamera() {
    if (textMode) {
      try {
        const sizes = await cameraRef.current?.getAvailablePictureSizesAsync();
        const suitable = sizes?.filter((size) => {
          const [w, h] = size.split('x').map(Number);
          return w * h <= 2_100_000;
        }).sort((a, b) => {
          const area = (size: string) => size.split('x').map(Number).reduce((a, b) => a * b, 1);
          return area(b) - area(a);
        });
        if (suitable?.[0]) setPictureSize(suitable[0]);
      } catch { /* The JPEG size is also checked before upload. */ }
    }
    setCameraReady(true);
  }

  async function takePhoto() {
    if (lockedRef.current || !cameraReady || !cameraRef.current) return;
    lockedRef.current = true;
    setCapturing(true);
    setScanError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.65, exif: false });
      if (!photo?.base64 || photo.base64.length > 4 * 1024 * 1024 - 128) {
        throw new Error('Photo trop volumineuse ou indisponible. Reprends la photo avec moins de détails autour de la liste.');
      }
      onPhotographed?.(photo.base64);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'Impossible de prendre la photo.');
    } finally {
      lockedRef.current = false;
      setCapturing(false);
    }
  }

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (lockedRef.current || paused) return;
    if (!active || !cameraReady || cameraError) return;
    const value = invitation ? parseInvitationCode(result.data)
      : scanGate.current.read(result.data, result.type, Date.now());
    if (!value) {
      if (invitation) setScanError('Ce QR code n’est pas une invitation SmartShopping.');
      return;
    }
    setScanError(null);
    if (invitation) {
      lockedRef.current = true;
      setLocked(true);
    } else {
      pauseScanning();
      setLastProduct(value);
    }
    onScanned(value);
  }

  const ready = active && !paused && cameraReady && !cameraError && !locked && !coolingDown && !capturing;
  const frameColor = cameraError ? theme.danger : ready ? theme.primary : theme.muted;
  const cameraStatus = cameraError ? 'Caméra indisponible' : !active || paused ? 'En pause'
    : !cameraReady ? 'Démarrage…' : capturing ? 'Capture…' : locked ? 'Code détecté'
    : coolingDown ? 'Patiente un instant…' : textMode ? 'Prêt à photographier' : 'Prêt à scanner';

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, flexGrow: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Heading style={{ fontSize: 24, flex: 1 }}>{textMode ? 'Photographier une liste' : invitation ? 'Scanner une invitation' : 'Scanner un produit'}</Heading>
        <Pressable accessibilityRole="button" onPress={onCancel} style={{ padding: 12 }}>
          <Text style={{ color: theme.danger, fontWeight: '700' }}>Fermer</Text>
        </Pressable>
      </View>
      {!permission ? <Text>Vérification de l’autorisation caméra…</Text> : !permission.granted ? (
        <View style={{ gap: 12 }}>
          <Text style={{ color: theme.muted }}>
            {permission.canAskAgain === false
              ? 'L’accès caméra est bloqué. Dans les paramètres d’Expo Go ou de SmartShopping, ouvre Autorisations puis active Caméra.'
              : textMode ? 'Autorise l’accès caméra pour photographier ta liste.' : invitation ? 'Autorise l’accès caméra pour scanner une invitation.' : 'Autorise l’accès caméra pour scanner les codes-barres de tes produits.'}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => void allowCamera()} testID="request-camera-permission"
            style={{ backgroundColor: theme.primary, borderRadius: theme.radius, padding: 16 }}>
            <Text style={{ color: theme.onPrimary, fontWeight: '700', textAlign: 'center' }}>
              {permission.canAskAgain === false ? 'Ouvrir les paramètres' : 'Autoriser la caméra'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          {textMode || invitation ? <Text style={{ color: theme.muted }}>{textMode
            ? 'Cadre la liste, un article par ligne. Analyse sur ton serveur, connexion requise.'
            : 'Présente le QR code de la liste.'}</Text> : null}
          <View style={{ gap: 8 }}>
            <View testID="camera-frame" style={{ height: 328, borderWidth: 4, borderColor: frameColor,
              borderStyle: ready ? 'solid' : 'dashed', borderRadius: theme.radius, overflow: 'hidden', backgroundColor: theme.raised }}>
              {cameraError ? (
                <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
                  <Text accessibilityRole="alert" style={{ color: theme.danger, textAlign: 'center' }}>La caméra n’a pas pu démarrer.</Text>
                </View>
              ) : active ? (
                <CameraView ref={cameraRef} key={cameraAttempt} pictureSize={pictureSize}
                  barcodeScannerSettings={{ barcodeTypes: invitation ? ['qr'] : ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
                  facing="back" enableTorch={torch}
                  onCameraReady={() => void prepareCamera()}
                  onMountError={({ message }) => { setCameraReady(false); setCameraError(message); }}
                  onBarcodeScanned={textMode || locked || paused ? undefined : handleBarcodeScanned}
                  style={{ flex: 1, width: '100%' }}
                  testID="barcode-camera-view" />
              ) : null}
            </View>
            <Text accessibilityLiveRegion="polite" style={{ color: ready ? theme.text : theme.muted,
              fontWeight: '600', textAlign: 'center' }}>{cameraStatus}</Text>
          </View>
          {textMode ? <Pressable accessibilityRole="button" disabled={!cameraReady || capturing || !!cameraError}
            onPress={() => void takePhoto()} style={{ backgroundColor: theme.primary, padding: 14, borderRadius: theme.radius }}>
            <Text style={{ color: theme.onPrimary, textAlign: 'center', fontWeight: '700' }}>{capturing ? 'Capture…' : 'Photographier et reconnaître'}</Text>
          </Pressable> : null}
          {!textMode && !invitation && lastProduct ? <View style={{ gap: 8 }}>
            {statusMessage ? <Text accessibilityLiveRegion="polite">{statusMessage}</Text> : null}
            <Pressable accessibilityRole="button" disabled={!ready} onPress={() => { pauseScanning(); onScanned(lastProduct); }}
              style={{ backgroundColor: theme.raised, borderRadius: theme.radius, padding: 14 }}>
              <Text>Ajouter encore ce produit</Text>
            </Pressable>
          </View> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <Pressable accessibilityRole="button" disabled={!cameraReady || !!cameraError}
              onPress={() => setTorch((value) => !value)} style={{ backgroundColor: theme.raised, borderRadius: theme.radius, padding: 14 }}>
              <Text>{torch ? 'Éteindre la lampe' : 'Allumer la lampe'}</Text>
            </Pressable>
            {cameraError || locked ? <Pressable accessibilityRole="button" onPress={restartCamera}
              style={{ backgroundColor: theme.raised, borderRadius: theme.radius, padding: 14 }}>
              <Text>{locked ? 'Scanner encore' : 'Relancer la caméra'}</Text>
            </Pressable> : null}
          </View>
        </>
      )}
      {scanError ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{scanError}</Text> : null}
      {permissionError ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{permissionError}</Text> : null}
    </ScrollView>
  );
}
