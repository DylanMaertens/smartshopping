export type ThemeId = 'minimal' | 'papier' | 'pastel' | 'nuit' | 'pixel' | 'contraste';
export type Theme = {
  id: ThemeId; name: string; description: string; dark: boolean;
  bg: string; surface: string; raised: string; text: string; muted: string;
  border: string; primary: string; onPrimary: string; danger: string; success: string; warning: string;
  radius: number; stroke: number; bodySize: number; tap: number;
};
const base = { dark: false, radius: 16, stroke: 1, bodySize: 16, tap: 48 };
export const themes: Record<ThemeId, Theme> = {
  minimal: { ...base, id: 'minimal', name: 'Minimal', description: 'Clair, net et essentiel', bg: '#F8F9FC', surface: '#FFFFFF', raised: '#EAF0FF', text: '#172033', muted: '#556176', border: '#CDD5E2', primary: '#2855CC', onPrimary: '#FFFFFF', danger: '#B42332', success: '#246545', warning: '#85520A' },
  papier: { ...base, id: 'papier', name: 'Papier', description: 'La douceur d’un carnet', bg: '#FAF3E7', surface: '#FFF9EF', raised: '#EFE3D0', text: '#342718', muted: '#725B42', border: '#CDBDA5', primary: '#795735', onPrimary: '#FFFFFF', danger: '#A62D27', success: '#436437', warning: '#815509', radius: 10 },
  pastel: { ...base, id: 'pastel', name: 'Pastel', description: 'Des courses en couleur', bg: '#FAF7FE', surface: '#FFFFFF', raised: '#EEE4FA', text: '#342641', muted: '#6F5A7C', border: '#D3C3DF', primary: '#70438C', onPrimary: '#FFFFFF', danger: '#AB284F', success: '#29664D', warning: '#80500F', radius: 22 },
  nuit: { ...base, id: 'nuit', name: 'Nuit', description: 'Sobre, même dans le noir', dark: true, bg: '#111214', surface: '#1D1F23', raised: '#303339', text: '#F5F5F6', muted: '#B7BBC5', border: '#666B76', primary: '#F5F5F6', onPrimary: '#151619', danger: '#FFABB2', success: '#A1DCB5', warning: '#F5CF86' },
  pixel: { ...base, id: 'pixel', name: 'Pixel', description: 'Un petit air rétro', bg: '#FAF3E5', surface: '#FFF9ED', raised: '#E8ECD9', text: '#20251E', muted: '#59604F', border: '#20251E', primary: '#8ADBA8', onPrimary: '#142C1C', danger: '#A3272E', success: '#306140', warning: '#80500D', radius: 0, stroke: 2 },
  contraste: { ...base, id: 'contraste', name: 'Contraste', description: 'Grand, lisible et affirmé', dark: true, bg: '#050505', surface: '#101010', raised: '#252525', text: '#FFFFFF', muted: '#D0D0D0', border: '#B0B0B0', primary: '#FFE500', onPrimary: '#090909', danger: '#FFB0B0', success: '#B3EDBC', warning: '#FFE500', radius: 12, stroke: 2, bodySize: 18, tap: 52 },
};
export const themeIds = Object.keys(themes) as ThemeId[];
export function isThemeId(value: string | null): value is ThemeId { return value !== null && themeIds.includes(value as ThemeId); }
