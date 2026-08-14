type WebkitWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

let audioContext: AudioContext | null = null;

export function prepareBarcodeScanSound() {
  const AudioContextConstructor = window.AudioContext
    ?? (window as WebkitWindow).webkitAudioContext;
  if (!AudioContextConstructor) return null;

  try {
    audioContext ??= new AudioContextConstructor();
    void audioContext.resume().catch(() => undefined);
    return audioContext;
  } catch {
    return null;
  }
}

export function playBarcodeScanSound() {
  try {
    const context = prepareBarcodeScanSound();
    if (!context) return;
    void context.resume().then(() => {
      const now = context.currentTime;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
      gain.connect(context.destination);

      const oscillator = context.createOscillator();
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(1320, now);
      oscillator.frequency.setValueAtTime(1760, now + 0.055);
      oscillator.connect(gain);
      oscillator.start(now);
      oscillator.stop(now + 0.14);
    }).catch(() => undefined);
  } catch {
    // Scanning must still complete when a browser blocks audio playback.
  }
}
