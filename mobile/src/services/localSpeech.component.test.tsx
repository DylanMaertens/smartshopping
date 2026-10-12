import { PermissionsAndroid, Platform } from 'react-native';

const mockNativeSpeech = {
  isAvailable: jest.fn(), recognize: jest.fn(), cancel: jest.fn(), stop: jest.fn(),
};
jest.mock('expo', () => ({ requireOptionalNativeModule: () => mockNativeSpeech }));

it('uses only the native local module, and never starts on permission request alone', async () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'android');
  try {
    const { localSpeech, speechErrorMessage } = require('./localSpeech');
    const permission = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    mockNativeSpeech.isAvailable.mockResolvedValue(true);
    mockNativeSpeech.recognize.mockResolvedValue('du lait');
    expect(await localSpeech.isAvailable()).toBe(true);
    expect(await localSpeech.requestPermission()).toBe(true);
    expect(mockNativeSpeech.recognize).not.toHaveBeenCalled();
    expect(await localSpeech.recognize()).toBe('du lait');
    expect(mockNativeSpeech.recognize).toHaveBeenCalledWith('fr-FR');
    expect(permission).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    mockNativeSpeech.isAvailable.mockRejectedValue(new Error('unavailable'));
    expect(await localSpeech.isAvailable()).toBe(false);
    expect(speechErrorMessage({ code: 'E_LANGUAGE' })).toMatch(/français/);
    expect(speechErrorMessage({ code: 'E_UNAVAILABLE' })).toMatch(/Android 12/);
    expect(speechErrorMessage({ code: 'unexpected' })).toMatch(/Aucun service en ligne/);
    await localSpeech.cancel(); await localSpeech.stop();
    expect(mockNativeSpeech.cancel).toHaveBeenCalled(); expect(mockNativeSpeech.stop).toHaveBeenCalled();
    permission.mockRestore();
  } finally { platform.restore(); }
});
