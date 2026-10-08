import type { BreathPhase, BreathState } from '../breathing/BreathEngine.js';

/**
 * Spoken breathing cues, using the device's available speech synthesis.
 * The existing XR text/jellyfish guidance remains the fallback when
 * speech synthesis is not supported (including on some headset browsers).
 * No extra audio context, render loop, or network dependency is created.
 */
export class BreathVoice {
  private readonly synth: SpeechSynthesis | null =
    typeof window !== 'undefined' && 'speechSynthesis' in window
      ? window.speechSynthesis
      : null;

  private muted = false;
  private active = false;
  private lastPhase: BreathPhase | null = null;

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.synth?.cancel();
    }
  }

  announce(state: BreathState): void {
    if (this.active && this.lastPhase === state.phase) {
      return;
    }

    this.lastPhase = state.phase;
    if (this.muted || this.synth == null ||
        typeof SpeechSynthesisUtterance === 'undefined') {
      return;
    }

    this.active = true;
    this.synth.cancel();

    const utterance = new SpeechSynthesisUtterance(
      state.phase === 'inhale' ? 'Breathe in' : 'Breathe out',
    );
    utterance.lang = 'en-US';
    utterance.rate = 0.85;
    utterance.pitch = 0.96;
    utterance.volume = 0.7;
    this.synth.speak(utterance);
  }

  update(state: BreathState, running: boolean): void {
    if (!running) {
      this.pause();
      return;
    }

    if (state.phase !== this.lastPhase) {
      this.announce(state);
    }
  }

  pause(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    this.synth?.cancel();
  }

  reset(): void {
    this.pause();
    this.lastPhase = null;
  }

  dispose(): void {
    this.reset();
  }
}