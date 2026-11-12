import { LocalKeyValueStorage } from './localKeyValueStorage';

// Preview preference only, not permission for a future upload. Never backed up.
export const OCR_CONTRIBUTION_PREVIEW_KEY = 'ocr.contribution-preview.v1';
export function readOcrContributionPreview(): boolean {
  try { return LocalKeyValueStorage.getString(OCR_CONTRIBUTION_PREVIEW_KEY) === 'true'; }
  catch { return false; }
}
export function saveOcrContributionPreview(enabled: boolean): void {
  LocalKeyValueStorage.setString(OCR_CONTRIBUTION_PREVIEW_KEY, String(enabled));
}
