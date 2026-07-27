import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';

type Props = {
  onCancel: () => void;
  onScanned: (barcode: string) => void;
};

export function BarcodeScannerPanel({ onCancel, onScanned }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);

  if (!permission) {
    return <Text style={{ color: '#64748b' }}>Initialisation de la caméra…</Text>;
  }

  if (!permission.granted) {
    return (
      <View style={{ backgroundColor: '#f8fafc', borderRadius: 16, gap: 12, padding: 16 }}>
        <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '700' }}>Scanner un code-barres</Text>
        <Text style={{ color: '#64748b' }}>
          Autorise l’accès caméra pour scanner un EAN/UPC et l’ajouter à ta liste.
        </Text>
        <Pressable
          onPress={requestPermission}
          style={{ alignItems: 'center', backgroundColor: '#0f172a', borderRadius: 12, padding: 12 }}
        >
          <Text style={{ color: '#ffffff', fontWeight: '700' }}>Autoriser la caméra</Text>
        </Pressable>
        <Pressable onPress={onCancel} style={{ alignItems: 'center', padding: 8 }}>
          <Text style={{ color: '#64748b', fontWeight: '700' }}>Annuler</Text>
        </Pressable>
      </View>
    );
  }

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (locked) return;

    setLocked(true);
    onScanned(result.data);
  }

  return (
    <View style={{ borderRadius: 16, gap: 12, overflow: 'hidden' }}>
      <CameraView
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
        facing="back"
        onBarcodeScanned={locked ? undefined : handleBarcodeScanned}
        style={{ height: 320, width: '100%' }}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={() => setLocked(false)}
          style={{ alignItems: 'center', backgroundColor: '#e2e8f0', borderRadius: 12, flex: 1, padding: 12 }}
        >
          <Text style={{ color: '#0f172a', fontWeight: '700' }}>Scanner encore</Text>
        </Pressable>
        <Pressable
          onPress={onCancel}
          style={{ alignItems: 'center', backgroundColor: '#fee2e2', borderRadius: 12, flex: 1, padding: 12 }}
        >
          <Text style={{ color: '#991b1b', fontWeight: '700' }}>Fermer</Text>
        </Pressable>
      </View>
    </View>
  );
}
