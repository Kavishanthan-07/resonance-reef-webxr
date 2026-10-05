export type BreathPhase = 'inhale' | 'exhale';

export interface BreathState {
  phase: BreathPhase;
  progress: number;
  elapsedInPhase: number;
  phaseDuration: number;
  completedCycles: number;
}

export interface BreathTiming {
  inhaleSeconds?: number;
  exhaleSeconds?: number;
}

/**
 * Produces a normalized breathing signal that the entire experience can consume.
 *
 * Guided mode currently uses a fixed breathing rhythm:
 * 5 seconds inhale
 * 5 seconds exhale
 *
 * Later, microphone/headset respiration sensing can replace the timing source
 * without requiring the ocean systems to change.
 */
export class BreathEngine {
  private readonly inhaleSeconds: number;
  private readonly exhaleSeconds: number;

  private phase: BreathPhase = 'inhale';
  private elapsedInPhase = 0;
  private completedCycles = 0;

  constructor(timing: BreathTiming = {}) {
    this.inhaleSeconds = timing.inhaleSeconds ?? 5;
    this.exhaleSeconds = timing.exhaleSeconds ?? 5;

    if (this.inhaleSeconds <= 0 || this.exhaleSeconds <= 0) {
      throw new Error('Breathing phase durations must be greater than zero.');
    }
  }

  update(deltaSeconds: number): BreathState {
    this.elapsedInPhase += Math.max(0, deltaSeconds);

    let duration = this.getPhaseDuration();

    while (this.elapsedInPhase >= duration) {
      this.elapsedInPhase -= duration;

      if (this.phase === 'inhale') {
        this.phase = 'exhale';
      } else {
        this.phase = 'inhale';
        this.completedCycles += 1;
      }

      duration = this.getPhaseDuration();
    }

    return this.getState();
  }

  getState(): BreathState {
    const duration = this.getPhaseDuration();

    return {
      phase: this.phase,
      progress: Math.min(1, this.elapsedInPhase / duration),
      elapsedInPhase: this.elapsedInPhase,
      phaseDuration: duration,
      completedCycles: this.completedCycles,
    };
  }

  reset(): void {
    this.phase = 'inhale';
    this.elapsedInPhase = 0;
    this.completedCycles = 0;
  }

  private getPhaseDuration(): number {
    return this.phase === 'inhale'
      ? this.inhaleSeconds
      : this.exhaleSeconds;
  }
}