import { BrowserMultiFormatReader } from '@zxing/browser';
import { expect, test } from 'vitest';

const leftPatterns = {
  L: ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'],
  G: ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
} as const;
const rightPatterns = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const parityPatterns = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'] as const;

function drawEan13(barcode: string) {
  const digits = [...barcode].map(Number);
  const parity = parityPatterns[digits[0]];
  const left = digits.slice(1, 7).map((digit, index) => leftPatterns[parity[index] as 'L' | 'G'][digit]).join('');
  const right = digits.slice(7).map((digit) => rightPatterns[digit]).join('');
  const modules = `101${left}01010${right}101`;
  const moduleWidth = 4;
  const quietZone = 12;
  const canvas = document.createElement('canvas');
  canvas.width = (modules.length + quietZone * 2) * moduleWidth;
  canvas.height = 180;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000';
  [...modules].forEach((module, index) => {
    if (module === '1') context.fillRect((quietZone + index) * moduleWidth, 10, moduleWidth, 150);
  });
  return canvas;
}

test('the Safari fallback decoder reads a real EAN-13 product barcode image', () => {
  const reader = new BrowserMultiFormatReader();
  const result = reader.decodeFromCanvas(drawEan13('4600494600012'));

  expect(result.getText()).toBe('4600494600012');
});
