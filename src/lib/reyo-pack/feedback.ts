"use client";

export type ReyoPackFeedbackKind = "scan" | "packed" | "unknown" | "alreadyPacked" | "cancelled";

export interface ReyoPackFeedbackSettings {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  soundVolume: number;
}

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextConstructor = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  audioContext ??= new AudioContextConstructor();
  return audioContext;
}

function beep(frequency: number, durationMs: number, volume: number): void {
  const context = getAudioContext();
  if (!context) return;
  void context.resume().catch(() => undefined);
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(Math.max(0.01, Math.min(1, volume)) * 0.12, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + durationMs / 1000);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + durationMs / 1000);
}

export function emitReyoPackFeedback(kind: ReyoPackFeedbackKind, settings: ReyoPackFeedbackSettings): void {
  if (typeof navigator !== "undefined" && settings.vibrationEnabled && "vibrate" in navigator) {
    const pattern: VibratePattern = kind === "packed"
      ? [80, 50, 140]
      : kind === "cancelled"
        ? [180, 70, 180, 70, 260]
        : kind === "alreadyPacked"
          ? [120, 60, 120]
          : kind === "unknown"
            ? [220]
            : [55];
    try { navigator.vibrate(pattern); } catch { /* Browser does not expose vibration. */ }
  }
  if (!settings.soundEnabled) return;
  if (kind === "packed") {
    beep(880, 110, settings.soundVolume);
    window.setTimeout(() => beep(1175, 140, settings.soundVolume), 80);
  } else if (kind === "scan") {
    beep(740, 80, settings.soundVolume);
  } else if (kind === "unknown") {
    beep(180, 180, settings.soundVolume);
  } else {
    beep(kind === "cancelled" ? 150 : 260, 220, settings.soundVolume);
  }
}
