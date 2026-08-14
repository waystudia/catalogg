export type BrowserBarcodeDecoderControls = {
  stop: () => void;
};

export async function startBrowserBarcodeDecoder(
  video: HTMLVideoElement,
  onDetected: (barcode: string) => boolean
): Promise<BrowserBarcodeDecoderControls> {
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const reader = new BrowserMultiFormatReader(undefined, {
    delayBetweenScanAttempts: 160,
    delayBetweenScanSuccess: 500
  });

  return reader.decodeFromVideoElement(video, (result, _error, controls) => {
    const barcode = result?.getText().trim();
    if (barcode && onDetected(barcode)) controls.stop();
  });
}
