export type ExperiencePhase =
  | 'ready'
  | 'running'
  | 'paused'
  | 'complete';

export interface ExperienceState {
  phase: ExperiencePhase;
  muted: boolean;
}

interface ExperienceControllerHooks {
  resetExperience: () => void;
  resumeAudio: () => Promise<void> | void;
  setMuted: (muted: boolean) => void;
}

export class ExperienceController {
  private state: ExperienceState = {
    muted: false,
    phase: 'ready',
  };
  private audioWarningLogged = false;

  constructor(
    private readonly hooks: ExperienceControllerHooks,
  ) {}

  getState(): ExperienceState {
    return this.state;
  }

  start(): void {
    this.hooks.resetExperience();
    this.state = {
      ...this.state,
      phase: 'running',
    };
    this.requestAudioUnlock();
  }

  pause(): void {
    if (this.state.phase !== 'running') {
      return;
    }

    this.state = {
      ...this.state,
      phase: 'paused',
    };
  }

  resume(): void {
    if (this.state.phase !== 'paused') {
      return;
    }

    this.state = {
      ...this.state,
      phase: 'running',
    };
    this.requestAudioUnlock();
  }

  restart(): void {
    this.start();
  }

  markComplete(): void {
    if (this.state.phase !== 'running') {
      return;
    }

    this.state = {
      ...this.state,
      phase: 'complete',
    };
  }

  setMuted(muted: boolean): void {
    this.state = {
      ...this.state,
      muted,
    };
    this.hooks.setMuted(muted);
  }

  toggleMuted(): void {
    this.setMuted(!this.state.muted);
  }

  private requestAudioUnlock(): void {
    void Promise.resolve(this.hooks.resumeAudio()).catch(
      (error: unknown) => {
        if (this.audioWarningLogged) {
          return;
        }

        this.audioWarningLogged = true;
        console.warn(
          '[Resonance Reef] Audio unlock failed; continuing visuals.',
          error,
        );
      },
    );
  }
}
