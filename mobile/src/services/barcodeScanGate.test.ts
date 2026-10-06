import { describe, expect, it } from 'vitest';
import { BarcodeScanGate, normalizeScannedBarcode } from './barcodeScanGate';

describe('barcode validation', () => {
  it('checks EAN-8, EAN-13, UPC-A and expands UPC-E', () => {
    expect(normalizeScannedBarcode('96385074', 'ean8')).toBe('96385074');
    expect(normalizeScannedBarcode('3017620422003', 'ean13')).toBe('3017620422003');
    expect(normalizeScannedBarcode('036000291452', 'upc_a')).toBe('0036000291452');
    expect(normalizeScannedBarcode('04252614', 'upc_e')).toBe('0042100005264');
    for (const bad of ['00000000', '3017620422004', '12345678', '123', 'abc']) {
      expect(normalizeScannedBarcode(bad)).toBeNull();
    }
  });
  it('requires sustained matching readings and never counts a stationary code twice', () => {
    const gate = new BarcodeScanGate();
    expect(gate.read('3017620422003', 'ean13', 0)).toBeNull();
    expect(gate.read('3017620422003', 'ean13', 100)).toBeNull();
    expect(gate.read('3017620422003', 'ean13', 250)).toBe('3017620422003');
    expect(gate.read('3274080005003', 'ean13', 500)).toBeNull();
    expect(gate.read('3274080005003', 'ean13', 1749)).toBeNull();
    expect(gate.read('3274080005003', 'ean13', 1750)).toBeNull();
    expect(gate.read('3274080005003', 'ean13', 2000)).toBe('3274080005003');
    expect(gate.read('3274080005003', 'ean13', 4000)).toBeNull();
    expect(gate.read('3274080005003', 'ean13', 5000)).toBeNull();
    expect(gate.read('3017620422003', 'ean13', 6000)).toBeNull();
    expect(gate.read('3017620422003', 'ean13', 6250)).toBe('3017620422003');
  });
  it('rejects alternating readings, resets on gaps, and treats UPC/EAN as one code', () => {
    const gate = new BarcodeScanGate();
    for (let time = 0; time < 2000; time += 250) {
      expect(gate.read(time % 500 ? '3274080005003' : '3017620422003', 'ean13', time)).toBeNull();
    }
    expect(gate.read('036000291452', 'upc_a', 3000)).toBeNull();
    expect(gate.read('0036000291452', 'ean13', 5000)).toBeNull();
    expect(gate.read('036000291452', 'upc_a', 5250)).toBe('0036000291452');
    expect(gate.read('0036000291452', 'ean13', 9000)).toBeNull();
    gate.resetCandidate();
    expect(gate.read('3274080005003', 'ean13', 10000)).toBeNull();
  });
});
