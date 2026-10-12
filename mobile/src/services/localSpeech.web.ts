// Deliberately no Web Speech API: browsers may send audio to a remote service.
export { speechErrorMessage } from './speechErrors';
export const localSpeech = {
  async isAvailable(): Promise<boolean> { return false; },
  async requestPermission(): Promise<boolean> { return false; },
  async recognize(): Promise<string> { throw Object.assign(new Error('Unavailable'), { code: 'E_UNAVAILABLE' }); },
  async stop(): Promise<void> {},
  async cancel(): Promise<void> {},
};
