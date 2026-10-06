import React, { forwardRef, useEffect, useImperativeHandle } from 'react';
import { Text, View } from 'react-native';
const granted = { granted: true, canAskAgain: true };
const refresh = async () => granted;
export const useCameraPermissions = () => [granted, refresh, refresh];
export const CameraView = forwardRef(function CameraView(props: any, ref) {
  useEffect(() => { props.onCameraReady?.(); }, []);
  useImperativeHandle(ref, () => ({ getAvailablePictureSizesAsync: async () => ['1024x1024'], takePictureAsync: async () => ({ base64: '' }) }));
  return <View style={[props.style, { backgroundColor: '#20242a', justifyContent: 'center', alignItems: 'center' }]}><Text style={{ color: '#fff' }}>Caméra · à vérifier sur Android</Text></View>;
});
export default function QR() { return <View style={{ width: 150, height: 150, justifyContent: 'center' }}><Text>Aperçu du QR réservé au téléphone</Text></View>; }
