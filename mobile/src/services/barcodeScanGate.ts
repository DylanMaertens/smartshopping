export const SCAN_COOLDOWN_MS = 1500;
const STABILITY_MS = 250;
const MAX_READING_GAP_MS = 1000;

// Canonical GTIN: UPC-A and its EAN-13 representation refer to the same product.
export function normalizeScannedBarcode(data: string, type?: string): string | null {
  if (!/^\d+$/.test(data)) return null;
  let code = data;
  if (type === 'upc_e') {
    if (code.length !== 8 || !/^[01]/.test(code)) return null;
    const [system, a, b, c, d, e, f, check] = code;
    if ('012'.includes(f)) code = `${system}${a}${b}${f}0000${c}${d}${e}${check}`;
    else if (f === '3') code = `${system}${a}${b}${c}00000${d}${e}${check}`;
    else if (f === '4') code = `${system}${a}${b}${c}${d}00000${e}${check}`;
    else code = `${system}${a}${b}${c}${d}${e}0000${f}${check}`;
  }
  if (![8, 12, 13].includes(code.length) || /^0+$/.test(code)) return null;
  const digits = code.slice(0, -1).split('').reverse().map(Number);
  const check = (10 - digits.reduce((sum, digit, i) => sum + digit * (i % 2 === 0 ? 3 : 1), 0) % 10) % 10;
  if (check !== Number(code.charAt(code.length - 1))) return null;
  return code.length === 12 ? `0${code}` : code;
}

export class BarcodeScanGate {
  private candidate: { code: string; since: number; lastSeen: number } | null = null;
  private lastAccepted: string | null = null;
  private pausedUntil = 0;

  resetCandidate() { this.candidate = null; }

  pause(now: number) {
    this.pausedUntil = now + SCAN_COOLDOWN_MS;
    this.resetCandidate();
  }

  read(data: string, type: string | undefined, now: number): string | null {
    if (now < this.pausedUntil) return null;
    const code = normalizeScannedBarcode(data, type);
    if (!code || code === this.lastAccepted) { this.resetCandidate(); return null; }
    if (!this.candidate || this.candidate.code !== code || now - this.candidate.lastSeen > MAX_READING_GAP_MS) {
      this.candidate = { code, since: now, lastSeen: now };
      return null;
    }
    this.candidate.lastSeen = now;
    if (now - this.candidate.since < STABILITY_MS) return null;
    this.lastAccepted = code;
    this.pause(now);
    return code;
  }
}
