import { PermissionsAndroid, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
export { speechErrorMessage } from './speechErrors';

type SpeechModule = {
  isAvailable(): Promise<boolean>;
  recognize(language: string): Promise<string>;
  stop(): Promise<void>;
  cancel(): Promise<void>;
};
const native = Platform.OS === 'android' ? requireOptionalNativeModule<SpeechModule>('PodunaSpeech') : null;

export const localSpeech = {
  async isAvailable(): Promise<boolean> {
    return native ? native.isAvailable().catch(() => false) : false;
  },
  async requestPermission(): Promise<boolean> {
    if (!native) return false;
    return await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO) === PermissionsAndroid.RESULTS.GRANTED;
  },
  async recognize(): Promise<string> {
    if (!native) throw Object.assign(new Error('Unavailable'), { code: 'E_UNAVAILABLE' });
    return native.recognize('fr-FR');
  },
  async stop(): Promise<void> { await native?.stop(); },
  async cancel(): Promise<void> { await native?.cancel(); },
};
