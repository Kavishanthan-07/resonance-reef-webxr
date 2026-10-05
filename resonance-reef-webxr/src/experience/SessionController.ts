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
  environmentIntensity: number;
  finaleReady: boolean;
  finaleTriggered: boolean;
}

const DEBUG_SESSION = false;
const TARGET_CYCLES = 8;
const INITIAL_STATE: SessionState = {
  completedCycles: 0,
  environmentIntensity: 0.74,
  finaleReady: false,
  finaleTriggered: false,
  overallProgress: 0,
  stage: 'intro',
  stageProgress: 0,
};

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

function interpolate(
  start: number,
  end: number,
  progress: number,
): number {
  return start + (end - start) * smoothStep(progress);
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

function getEnvironmentIntensity(
  stage: SessionStage,
  stageProgress: number,
): number {
  switch (stage) {
    case 'intro':
      return interpolate(0.74, 0.78, stageProgress);
    case 'awakening':
      return interpolate(0.8, 0.85, stageProgress);
    case 'resonance':
      return interpolate(0.88, 0.92, stageProgress);
    case 'full-reef':
      return interpolate(0.96, 1, stageProgress);
    case 'finale-ready':
      return 1;
  }
}

export class SessionController {
  private previousStage: SessionStage = 'intro';
  private finaleHasTriggered = false;
  private state: SessionState = { ...INITIAL_STATE };

  update(state: BreathState): SessionState {
    const stage = getStage(state.completedCycles);
    const cyclePosition = getCyclePosition(state);
    const overallProgress =
      clamp01(state.completedCycles / TARGET_CYCLES);
    const stageProgress =
      getStageProgress(stage, cyclePosition);
    const environmentIntensity =
      getEnvironmentIntensity(stage, stageProgress);
    const finaleReady =
      state.completedCycles >= TARGET_CYCLES;
    const finaleTriggered =
      finaleReady && !this.finaleHasTriggered;

    if (finaleTriggered) {
      this.finaleHasTriggered = true;
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

    this.state = {
      completedCycles: state.completedCycles,
      environmentIntensity,
      finaleReady,
      finaleTriggered,
      overallProgress,
      stage,
      stageProgress,
    };

    return this.state;
  }

  getState(): SessionState {
    return this.state;
  }

  reset(): void {
    this.previousStage = 'intro';
    this.finaleHasTriggered = false;
    this.state = { ...INITIAL_STATE };
  }
}
