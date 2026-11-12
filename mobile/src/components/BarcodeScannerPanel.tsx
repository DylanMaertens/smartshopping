import React, { useEffect, useRef, useState } from 'react';
import { AppState, Linking, ScrollView, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Heading, Pressable, Text } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { parseInvitationCode } from '@/services/api/invitationCode';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { BarcodeScanGate, normalizeScannedBarcode, SCAN_COOLDOWN_MS } from '@/services/barcodeScanGate';
import { barcodeInsideFrame, cameraPreviewLayout, type FrameSize } from '@/services/cameraFrame';
import { cropCameraPhoto, removeCameraPhoto } from '@/services/cropCameraPhoto';

type Props = {
  mode?: 'product' | 'invitation' | 'text';
  onPhotographed?: (base64: string) => void;
  onCancel: () => void;
  onScanned: (barcode: string) => void;
  statusMessage?: string | null;
  paused?: boolean;
  showInstructions?: boolean;
  embedded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

export function BarcodeScannerPanel({ onCancel, onScanned, mode = 'product', onPhotographed, statusMessage, paused = false, showInstructions = true, embedded = false, expanded = false, onExpandedChange }: Props) {
  const { theme } = useTheme();
  const textMode = mode === 'text';
  const cameraRef = useRef<CameraView>(null);
  const [frame, setFrame] = useState<FrameSize>({ width: 0, height: 0 });
  const frameRef = useRef(frame);
  const captureGeneration = useRef(0);
  const preview = cameraPreviewLayout(frame);
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
  const [readingReceived, setReadingReceived] = useState(false);
  const invitation = mode === 'invitation';
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [torch, setTorch] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [active, setActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; captureGeneration.current += 1; }; }, []);
  useEffect(() => {
    captureGeneration.current += 1;
    scanGate.current.resetCandidate();
    setTorch(false);
  }, [expanded]);

  useEffect(() => {
    if (capturedPhoto === null) return;
    // Commit enableTorch=false to the native camera before the parent removes it.
    setCapturedPhoto(null);
    onPhotographed?.(capturedPhoto);
  }, [capturedPhoto, onPhotographed]);

  useEffect(() => () => { if (cooldownTimer.current) clearTimeout(cooldownTimer.current); }, []);
  useEffect(() => {
    if (paused) { scanGate.current.resetCandidate(); setTorch(false); onExpandedChange?.(false); }
  }, [paused, onExpandedChange]);

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
        captureGeneration.current += 1;
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
      setPermissionError('Impossible d’ouvrir les permissions. Autorise la caméra dans les paramètres d’Expo Go ou de Poduna.');
    }
  }

  function restartCamera() {
    captureGeneration.current += 1;
    scanGate.current.resetCandidate();
    setReadingReceived(false);
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
          return w * h <= 2_100_000 && Math.abs(Math.max(w, h) / Math.min(w, h) - 4 / 3) < 0.01;
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
    if (lockedRef.current || !active || paused || !cameraReady || !cameraRef.current || !preview) return;
    const generation = captureGeneration.current;
    const captureFrame = { ...frameRef.current };
    const currentCapture = () => mounted.current && generation === captureGeneration.current;
    let photoUri: string | undefined;
    lockedRef.current = true;
    setCapturing(true);
    setScanError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, exif: false });
      photoUri = photo?.uri;
      if (!currentCapture()) return;
      setTorch(false);
      if (!photo?.uri) throw new Error('Photo indisponible. Réessaie.');
      const cropped = await cropCameraPhoto(photo, captureFrame);
      if (currentCapture()) setCapturedPhoto(cropped);
    } catch (error) {
      if (!currentCapture()) return;
      setScanError(error instanceof Error ? error.message : 'Impossible de prendre la photo.');
    } finally {
      if (photoUri) removeCameraPhoto(photoUri);
      if (mounted.current) { setTorch(false); lockedRef.current = false; setCapturing(false); }
    }
  }

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (!mounted.current || textMode || lockedRef.current || paused) return;
    if (!active || cameraError) return;
    // A delivered native barcode is itself proof that the camera is ready.
    // Some devices deliver it before onCameraReady.
    setCameraReady(true);
    setReadingReceived(true);
    if (!barcodeInsideFrame(result, frameRef.current)) { scanGate.current.resetCandidate(); return; }
    // Android's display value can differ from the actual encoded GTIN.
    const data = !invitation && result.raw && normalizeScannedBarcode(result.raw, result.type)
      ? result.raw : result.data;
    const value = invitation ? parseInvitationCode(result.data)
      : scanGate.current.read(data, result.type, Date.now());
    if (!value) {
      if (invitation) setScanError('Ce QR code n’est pas une invitation Poduna.');
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
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: expanded ? 8 : 20, gap: expanded ? 8 : 16, flexGrow: 1 }}>
      {!embedded ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Heading style={{ fontSize: 24, flex: 1 }}>{textMode ? 'Photographier une liste' : invitation ? 'Scanner une invitation' : 'Scanner un produit'}</Heading>
        <Pressable accessibilityRole="button" onPress={onCancel} style={{ padding: 12 }}>
          <Text style={{ color: theme.danger, fontWeight: '700' }}>Fermer</Text>
        </Pressable>
      </View> : null}
      {!permission ? <Text>Vérification de l’autorisation caméra…</Text> : !permission.granted ? (
        <View style={{ gap: 12 }}>
          <Text style={{ color: theme.muted }}>
            {permission.canAskAgain === false
              ? 'L’accès caméra est bloqué. Dans les paramètres d’Expo Go ou de Poduna, ouvre Autorisations puis active Caméra.'
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
          {showInstructions && !expanded && (textMode || invitation) ? <Text style={{ color: theme.muted }}>{textMode
            ? 'Cadre la liste, un article par ligne. Analyse sur ton serveur, connexion requise.'
            : 'Présente le QR code de la liste.'}</Text> : null}
          <View style={{ gap: 8, flexGrow: expanded ? 1 : 0 }}>
            <View testID="camera-frame" style={{ height: expanded ? undefined : 328, flexGrow: expanded ? 1 : 0, minHeight: expanded ? 260 : undefined, borderWidth: 4, borderColor: frameColor,
              borderStyle: ready ? 'solid' : 'dashed', borderRadius: theme.radius, overflow: 'hidden', backgroundColor: theme.raised }}>
              {cameraError ? (
                <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
                  <Text accessibilityRole="alert" style={{ color: theme.danger, textAlign: 'center' }}>La caméra n’a pas pu démarrer.</Text>
                </View>
              ) : active ? (
                <View testID="camera-viewport" style={{ flex: 1, overflow: 'hidden' }} onLayout={({ nativeEvent: { layout } }) => {
                  if (layout.width === frameRef.current.width && layout.height === frameRef.current.height) return;
                  captureGeneration.current += 1;
                  scanGate.current.resetCandidate();
                  frameRef.current = { width: layout.width, height: layout.height };
                  setFrame(frameRef.current);
                }}>
                <CameraView ref={cameraRef} key={cameraAttempt} pictureSize={pictureSize} ratio="4:3"
                  barcodeScannerSettings={{ barcodeTypes: invitation ? ['qr'] : ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
                  facing="back" autofocus={cameraReady ? 'on' : 'off'} enableTorch={torch}
                  onCameraReady={() => void prepareCamera()}
                  onMountError={({ message }) => { setCameraReady(false); setCameraError(message); }}
                  onBarcodeScanned={textMode || locked || paused ? undefined : handleBarcodeScanned}
                  style={preview ? { position: 'absolute', ...preview } : { flex: 1, width: '100%' }}
                  testID="barcode-camera-view" />
                </View>
              ) : null}
              {!textMode || cameraError || locked ? <Pressable testID="camera-restart" accessibilityRole="button"
                accessibilityLabel={locked ? 'Scanner encore' : 'Relancer la caméra'}
                disabled={capturing} onPress={restartCamera}
                style={{ position: 'absolute', left: 8, top: 8, width: Math.max(48, theme.tap), height: Math.max(48, theme.tap),
                  alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: 'rgba(0, 0, 0, 0.72)' }}>
                <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" pointerEvents="none" accessible={false}>
                  <Path d="M20 7v5h-5 M20 12a8 8 0 1 0-2.34 5.66" stroke="#fff" strokeWidth={2}
                    strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </Pressable> : null}
              <Pressable testID="camera-torch-toggle" accessibilityRole="button"
                accessibilityLabel={torch ? 'Éteindre la lampe' : 'Allumer la lampe'}
                accessibilityState={{ selected: torch }} disabled={!cameraReady || capturing || !!cameraError || !active || paused || locked}
                onPress={() => setTorch((value) => !value)}
                style={{ position: 'absolute', left: 8, bottom: 8, width: Math.max(48, theme.tap), height: Math.max(48, theme.tap),
                  alignItems: 'center', justifyContent: 'center', borderRadius: 12,
                  backgroundColor: torch ? '#FFD54F' : 'rgba(0, 0, 0, 0.72)' }}>
                <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" pointerEvents="none" accessible={false}>
                  <Path d="M13 2L4 14h7l-1 8 10-12h-7l1-8Z" fill={torch ? '#171717' : 'none'}
                    stroke={torch ? '#171717' : '#fff'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                  {!torch ? <Path d="M3 3l18 18" stroke="#fff" strokeWidth={2} strokeLinecap="round" /> : null}
                </Svg>
              </Pressable>
              {onExpandedChange ? <Pressable testID="camera-size-toggle" accessibilityRole="button"
                accessibilityLabel={expanded ? 'Réduire le cadre caméra' : 'Agrandir le cadre caméra'}
                accessibilityState={{ expanded }} disabled={capturing} onPress={() => onExpandedChange(!expanded)}
                style={{ position: 'absolute', right: 8, bottom: 8, width: Math.max(48, theme.tap), height: Math.max(48, theme.tap),
                  alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: 'rgba(0, 0, 0, 0.72)' }}>
                <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" pointerEvents="none" accessible={false}>
                  <Path d={expanded
                    ? 'M3 9h6V3 M15 3v6h6 M21 15h-6v6 M9 21v-6H3'
                    : 'M9 3H3v6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6'}
                    stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </Pressable> : null}
            </View>
            <Text accessibilityLiveRegion="polite" style={{ color: ready ? theme.text : theme.muted,
              fontWeight: '600', textAlign: 'center' }}>{cameraStatus}</Text>
          </View>
          {textMode ? <Pressable accessibilityRole="button" disabled={!cameraReady || !preview || capturing || !!cameraError}
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
          {!expanded && !textMode && !invitation && cameraReady && !lastProduct ? <Text style={{ color: theme.muted, fontSize: 13 }}>
            {readingReceived ? (showInstructions ? 'Lecture reçue. Garde le code dans le cadre pour confirmer.' : 'Lecture en cours de confirmation.')
              : showInstructions ? 'Aucune lecture reçue pour le moment. Éloigne un peu le produit et éclaire le code.' : 'Aucune lecture reçue pour le moment.'}
          </Text> : null}
        </>
      )}
      {scanError ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{scanError}</Text> : null}
      {permissionError ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{permissionError}</Text> : null}
    </ScrollView>
  );
}
