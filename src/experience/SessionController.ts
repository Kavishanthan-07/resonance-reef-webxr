import type { BreathState } from '../breathing/BreathEngine.js';

export type SessionStage =
  | 'intro'
  | 'awakening'
  | 'resonance'
  | 'full-reef'
  | 'finale-ready';

export interface SessionState {
  stage: SessionStage;
  completedCycles: number;
  stageProgress: number;
  overallProgress: number;
  intensity: number;
  finaleReady: boolean;
  finaleJustReached: boolean;
}

const DEBUG_SESSION = false;
const TARGET_CYCLES = 8;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothStep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function getCyclePosition(state: BreathState): number {
  const phaseProgress =
    state.phase === 'inhale'
      ? state.progress * 0.5
      : 0.5 + state.progress * 0.5;

  return state.completedCycles + phaseProgress;
}

function getStage(completedCycles: number): SessionStage {
  if (completedCycles >= 8) {
    return 'finale-ready';
  }

  if (completedCycles >= 6) {
    return 'full-reef';
  }

  if (completedCycles >= 4) {
    return 'resonance';
  }

  if (completedCycles >= 2) {
    return 'awakening';
  }

  return 'intro';
}

function getStageProgress(
  stage: SessionStage,
  cyclePosition: number,
): number {
  switch (stage) {
    case 'intro':
      return clamp01(cyclePosition / 2);
    case 'awakening':
      return clamp01((cyclePosition - 2) / 2);
    case 'resonance':
      return clamp01((cyclePosition - 4) / 2);
    case 'full-reef':
      return clamp01((cyclePosition - 6) / 2);
    case 'finale-ready':
      return 1;
  }
}

export class SessionController {
  private previousStage: SessionStage = 'intro';
  private finaleTriggered = false;

  update(state: BreathState): SessionState {
    const stage = getStage(state.completedCycles);
    const cyclePosition = getCyclePosition(state);
    const overallProgress =
      clamp01(cyclePosition / TARGET_CYCLES);
    const finaleReady =
      state.completedCycles >= TARGET_CYCLES;
    const finaleJustReached =
      finaleReady && !this.finaleTriggered;

    if (finaleJustReached) {
      this.finaleTriggered = true;
    }

    if (stage !== this.previousStage) {
      this.previousStage = stage;

      if (DEBUG_SESSION) {
        console.log(
          `[Resonance Reef] Session stage: ${stage
            .replace('-', '_')
            .toUpperCase()}`,
        );
      }
    }

    return {
      completedCycles: state.completedCycles,
      finaleJustReached,
      finaleReady,
      intensity: 0.55 + smoothStep(overallProgress) * 0.45,
      overallProgress,
      stage,
      stageProgress: getStageProgress(
        stage,
        cyclePosition,
      ),
    };
  }

  reset(): void {
    this.previousStage = 'intro';
    this.finaleTriggered = false;
  }
}
