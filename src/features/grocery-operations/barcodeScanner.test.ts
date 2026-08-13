import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Product } from '../../entities/models';
import { BarcodeKeystrokeBuffer, findProductByBarcode, normalizeBarcode } from './barcodeScanner';

describe('grocery barcode scanner', () => {
  it('collects rapid scanner keystrokes and completes on Enter', () => {
    const buffer = new BarcodeKeystrokeBuffer();
    let result: string | null = null;
    '4601234567890'.split('').forEach((key, index) => {
      result = buffer.push(key, 1000 + index * 12);
    });
    result = buffer.push('Enter', 1170);
    assert.equal(result, '4601234567890');
  });

  it('does not merge slow keyboard typing into a scan', () => {
    const buffer = new BarcodeKeystrokeBuffer();
    '4601'.split('').forEach((key, index) => buffer.push(key, 1000 + index * 140));
    assert.equal(buffer.push('Enter', 1600), null);
  });

  it('finds only the normalized barcode in the current business products', () => {
    const products = [
      { id: 'cola', barcode: ' 4601234567890 ' },
      { id: 'milk', barcode: '4600000000002' }
    ] as Product[];
    assert.equal(normalizeBarcode(' 460 123 456 7890 '), '4601234567890');
    assert.equal(findProductByBarcode(products, '4601234567890')?.id, 'cola');
    assert.equal(findProductByBarcode(products, '9999999999999'), null);
  });
});
