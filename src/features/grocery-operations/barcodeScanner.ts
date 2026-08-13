import { useEffect, useRef } from 'react';
import type { Product } from '../../entities/models';

const printableKey = /^.{1}$/u;

export function normalizeBarcode(value: string) {
  return value.replace(/\s+/g, '').trim().slice(0, 64);
}

export function findProductByBarcode(products: readonly Product[], value: string) {
  const barcode = normalizeBarcode(value).toLowerCase();
  if (!barcode) return null;
  return products.find((product) => normalizeBarcode(product.barcode ?? '').toLowerCase() === barcode) ?? null;
}

export class BarcodeKeystrokeBuffer {
  private value = '';
  private lastAt = 0;

  constructor(
    private readonly maxGapMs = 90,
    private readonly minimumLength = 4
  ) {}

  push(key: string, at: number): string | null {
    if (key === 'Escape') {
      this.reset();
      return null;
    }

    if (key === 'Enter' || key === 'Tab') {
      const scanned = this.value.length >= this.minimumLength ? normalizeBarcode(this.value) : '';
      this.reset();
      return scanned || null;
    }

    if (!printableKey.test(key)) return null;
    if (this.lastAt > 0 && at - this.lastAt > this.maxGapMs) this.value = '';
    this.value += key;
    this.lastAt = at;
    return null;
  }

  reset() {
    this.value = '';
    this.lastAt = 0;
  }
}

export function useHardwareBarcodeScanner({
  enabled,
  onScan,
  allowWhenTyping = false
}: {
  enabled: boolean;
  onScan: (barcode: string) => void;
  allowWhenTyping?: boolean;
}) {
  const onScanRef = useRef(onScan);
  const bufferRef = useRef(new BarcodeKeystrokeBuffer());

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;
    const buffer = bufferRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches('input, textarea, select, [contenteditable="true"]') ?? false;
      if (isTyping && !allowWhenTyping) {
        buffer.reset();
        return;
      }
      const barcode = buffer.push(event.key, event.timeStamp || performance.now());
      if (!barcode) return;
      event.preventDefault();
      onScanRef.current(barcode);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      buffer.reset();
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [allowWhenTyping, enabled]);
}

export function playBarcodeBeep(tone: 'success' | 'error' = 'success') {
  try {
    const AudioContextClass = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = tone === 'success' ? 920 : 220;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.11);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
    oscillator.addEventListener('ended', () => void context.close(), { once: true });
  } catch {
    // Audio is an enhancement; a denied audio context must not block scanning.
  }
}
