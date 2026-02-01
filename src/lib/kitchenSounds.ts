/**
 * Kitchen View Sound Effects
 * Synthesized audio using Web Audio API for gamification feedback
 */

const STORAGE_KEY = "kitchen_sounds_enabled";

// Lazy singleton AudioContext
let audioContext: AudioContext | null = null;

/**
 * Get or create the AudioContext (lazy initialization)
 * AudioContext must be created after a user gesture in most browsers
 */
function getAudioContext(): AudioContext | null {
  if (audioContext) {
    return audioContext;
  }

  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      console.warn("Web Audio API not supported");
      return null;
    }

    audioContext = new AudioContextClass();
    return audioContext;
  } catch (error) {
    console.warn("Failed to create AudioContext:", error);
    return null;
  }
}

/**
 * Resume AudioContext if suspended (required after user gesture)
 */
async function ensureAudioContextResumed(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;

  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch (error) {
      console.warn("Failed to resume AudioContext:", error);
      return false;
    }
  }

  return ctx.state === "running";
}

/**
 * Play a single tone with envelope
 */
function playTone(
  frequency: number,
  duration: number,
  startTime: number,
  ctx: AudioContext
): void {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startTime);

  // Envelope: quick attack, sustain, smooth release
  const attackTime = 0.01;
  const releaseTime = 0.05;
  const peakGain = 0.3;

  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(peakGain, startTime + attackTime);
  gainNode.gain.setValueAtTime(peakGain, startTime + duration - releaseTime);
  gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

/**
 * Check if sounds are enabled (reads from localStorage)
 * Defaults to true if not set
 */
export function getSoundsEnabled(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) {
      return true; // Default enabled
    }
    return stored === "true";
  } catch {
    // localStorage might be unavailable (private browsing, etc.)
    return true;
  }
}

/**
 * Set sounds enabled/disabled (writes to localStorage)
 */
export function setSoundsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // localStorage might be unavailable
    console.warn("Failed to save sound preference to localStorage");
  }
}

/**
 * Play a short high-pitched "ding" sound for ball landing
 * ~800Hz tone for 100ms
 */
export async function playDing(): Promise<void> {
  if (!getSoundsEnabled()) return;

  try {
    const ready = await ensureAudioContextResumed();
    if (!ready || !audioContext) return;

    const now = audioContext.currentTime;
    playTone(800, 0.1, now, audioContext);
  } catch (error) {
    console.warn("Failed to play ding sound:", error);
  }
}

/**
 * Play a completion fanfare - three ascending tones
 * 400Hz → 600Hz → 800Hz, each ~150ms
 */
export async function playCompletionFanfare(): Promise<void> {
  if (!getSoundsEnabled()) return;

  try {
    const ready = await ensureAudioContextResumed();
    if (!ready || !audioContext) return;

    const now = audioContext.currentTime;
    const toneDuration = 0.15;
    const gap = 0.05; // Small gap between tones

    // Three ascending tones
    playTone(400, toneDuration, now, audioContext);
    playTone(600, toneDuration, now + toneDuration + gap, audioContext);
    playTone(800, toneDuration, now + (toneDuration + gap) * 2, audioContext);
  } catch (error) {
    console.warn("Failed to play completion fanfare:", error);
  }
}

/**
 * Play a "clunk" sound when balls land in the tray.
 * Low frequency thud with quick decay - simulates physical impact.
 * ~150Hz base with noise burst for texture.
 */
export async function playClunk(): Promise<void> {
  if (!getSoundsEnabled()) return;

  try {
    const ready = await ensureAudioContextResumed();
    if (!ready || !audioContext) return;

    const ctx = audioContext;
    const now = ctx.currentTime;

    // Low frequency thud
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(150, now);
    // Pitch drops quickly for thud effect
    oscillator.frequency.exponentialRampToValueAtTime(50, now + 0.1);

    // Quick attack, fast decay (thud envelope)
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.4, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    oscillator.start(now);
    oscillator.stop(now + 0.12);

    // Add a subtle noise burst for texture
    const bufferSize = ctx.sampleRate * 0.05; // 50ms of noise
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize); // Decaying noise
    }

    const noiseSource = ctx.createBufferSource();
    const noiseGain = ctx.createGain();
    noiseSource.buffer = buffer;
    noiseSource.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noiseGain.gain.setValueAtTime(0.08, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    noiseSource.start(now);
  } catch (error) {
    console.warn("Failed to play clunk sound:", error);
  }
}

/**
 * Play a "soft click" sound when marking a package as packed.
 * Short, satisfying click at mid-high frequency.
 * ~1200Hz with very short duration.
 */
export async function playSoftClick(): Promise<void> {
  if (!getSoundsEnabled()) return;

  try {
    const ready = await ensureAudioContextResumed();
    if (!ready || !audioContext) return;

    const ctx = audioContext;
    const now = ctx.currentTime;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(1200, now);
    // Slight pitch drop for satisfying click feel
    oscillator.frequency.exponentialRampToValueAtTime(800, now + 0.04);

    // Very quick envelope - snap attack, fast decay
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.2, now + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    oscillator.start(now);
    oscillator.stop(now + 0.06);
  } catch (error) {
    console.warn("Failed to play soft click sound:", error);
  }
}
