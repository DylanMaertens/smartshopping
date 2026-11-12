import { PersonalSettings } from './personalSettings';

export const HELP_STORAGE_KEY = 'interface.help-icons.v1';
export function readHelpIcons(): boolean {
  try { return PersonalSettings.getString(HELP_STORAGE_KEY) !== 'false'; }
  catch { return true; }
}
export function saveHelpIcons(visible: boolean): void {
  PersonalSettings.setString(HELP_STORAGE_KEY, String(visible));
}
