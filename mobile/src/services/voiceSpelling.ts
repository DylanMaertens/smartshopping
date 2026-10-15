import { suggestOcrCorrections, type OcrSuggestion } from './ocrSpelling';

/** Speech suggestions are opt-in: handwriting edit scores are not speech confidence. */
export function suggestVoiceCorrections(text: string, knownNames: readonly string[] = []): OcrSuggestion[] {
  return suggestOcrCorrections(text, knownNames)
    .map((suggestion): OcrSuggestion => ({ ...suggestion, confidence: 'uncertain' }));
}
