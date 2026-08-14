import { expect, test } from 'vitest';
import {
  FAST_BARCODE_READER_OPTIONS,
  decodeBarcodeImageData,
  planBarcodeScanFrame,
  preloadBrowserBarcodeDecoder
} from '../../src/features/grocery-operations/browserBarcodeDecoder';

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

function rotateCanvas(source: HTMLCanvasElement, quarterTurns: number) {
  const normalizedTurns = ((quarterTurns % 4) + 4) % 4;
  if (normalizedTurns === 0) return source;

  const canvas = document.createElement('canvas');
  const swapsSides = normalizedTurns % 2 === 1;
  canvas.width = swapsSides ? source.height : source.width;
  canvas.height = swapsSides ? source.width : source.height;
  const context = canvas.getContext('2d')!;
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(normalizedTurns * Math.PI / 2);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

test('the iPhone fallback preloads its decoder and reads a real EAN-13 product barcode', async () => {
  await preloadBrowserBarcodeDecoder();
  const canvas = drawEan13('4600494600012');
  const image = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);

  await expect(decodeBarcodeImageData(image)).resolves.toBe('4600494600012');
});

test('the fast iPhone reader decodes one frame in every phone orientation', async () => {
  const barcode = drawEan13('4600494600012');

  for (const quarterTurns of [0, 1, 2, 3]) {
    const canvas = rotateCanvas(barcode, quarterTurns);
    const image = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    await expect(decodeBarcodeImageData(image)).resolves.toBe('4600494600012');
  }

  expect(FAST_BARCODE_READER_OPTIONS).toMatchObject({
    tryHarder: false,
    tryRotate: true,
    tryInvert: false,
    maxNumberOfSymbols: 1
  });
});

test('the first iPhone pass prioritizes a small center frame before a full-frame fallback', () => {
  expect(planBarcodeScanFrame(1920, 1080, 0)).toEqual({
    sourceX: 420,
    sourceY: 0,
    sourceWidth: 1080,
    sourceHeight: 1080,
    targetWidth: 720,
    targetHeight: 720
  });
  expect(planBarcodeScanFrame(1920, 1080, 1)).toEqual({
    sourceX: 0,
    sourceY: 0,
    sourceWidth: 1920,
    sourceHeight: 1080,
    targetWidth: 960,
    targetHeight: 540
  });
});
