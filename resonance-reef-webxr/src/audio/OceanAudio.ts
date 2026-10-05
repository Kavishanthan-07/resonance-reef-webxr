import {
  Quaternion,
  Vector3,
  type World,
} from '@iwsdk/core';

import type { BreathState } from '../breathing/BreathEngine.js';
import type { CurrentSample } from '../ocean/WaterCurrent.js';
import { ProceduralAudio } from './ProceduralAudio.js';

type AudioContextConstructor = new () => AudioContext;

interface AudioWindow extends Window {
  AudioContext?: AudioContextConstructor;
  webkitAudioContext?: AudioContextConstructor;
}

const DEBUG_AUDIO = false;

export class OceanAudio {
  private readonly context: AudioContext | null = null;
  private readonly procedural: ProceduralAudio | null = null;
  private readonly cameraPosition = new Vector3();
  private readonly cameraDirection = new Vector3();
  private readonly cameraUp = new Vector3(0, 1, 0);
  private readonly cameraQuaternion = new Quaternion();
  private readonly stationaryPosition = new Vector3(
    0,
    1.6,
    0,
  );
  private readonly unlock = (): void => {
    void this.tryResume();
  };

  private enabled = false;
  private disposed = false;
  private diagnosticTonePlayed = false;
  private graphDiagnosticsLogged = false;
  private warned = false;
  private listenerFallbackLogged = false;

  constructor(private readonly world: World) {
    try {
      if (typeof window === 'undefined') {
        this.warnOnce(
          '[Resonance Reef] Audio unavailable: window is not available.',
        );
        return;
      }

      const audioWindow = window as AudioWindow;
      const AudioContextClass =
        audioWindow.AudioContext ??
        audioWindow.webkitAudioContext;

      if (AudioContextClass == null) {
        this.warnOnce(
          '[Resonance Reef] Audio unavailable: AudioContext is not supported.',
        );
        return;
      }

      const context = new AudioContextClass();

      this.context = context;
      this.procedural =
        new ProceduralAudio(context);
      this.updateStationaryListener();
      this.installUnlockListeners();
    } catch (error: unknown) {
      this.warnOnce(
        '[Resonance Reef] Audio initialization failed.',
        error,
      );
    }
  }

  get masterGainValue(): number {
    return this.procedural?.masterGainValue ?? 0;
  }

  get reefCueCount(): number {
    return this.procedural?.reefCueCount ?? 0;
  }

  setMuted(muted: boolean): void {
    this.procedural?.setMuted(muted);
  }

  update(
    state: BreathState,
    current: CurrentSample,
    deltaSeconds: number,
    timeSeconds: number,
  ): void {
    if (
      this.context == null ||
      this.procedural == null ||
      this.disposed
    ) {
      return;
    }

    this.updateListener();
    this.procedural.update(
      state,
      current,
      deltaSeconds,
      timeSeconds,
    );
  }

  dispose(): void {
    this.disposed = true;
    this.removeUnlockListeners();

    if (
      this.context != null &&
      this.context.state !== 'closed'
    ) {
      void this.context.close().catch(() => {
        this.warnOnce(
          '[Resonance Reef] AudioContext close failed.',
        );
      });
    }
  }

  private installUnlockListeners(): void {
    window.addEventListener(
      'pointerdown',
      this.unlock,
      { passive: true },
    );
    window.addEventListener(
      'touchstart',
      this.unlock,
      { passive: true },
    );
    window.addEventListener(
      'keydown',
      this.unlock,
    );
  }

  private removeUnlockListeners(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.removeEventListener(
      'pointerdown',
      this.unlock,
    );
    window.removeEventListener(
      'touchstart',
      this.unlock,
    );
    window.removeEventListener(
      'keydown',
      this.unlock,
    );
  }

  private async tryResume(): Promise<void> {
    if (
      this.context == null ||
      this.enabled ||
      this.context.state === 'closed'
    ) {
      return;
    }

    try {
      await this.context.resume();

      if (this.context.state === 'running') {
        this.enabled = true;
        this.removeUnlockListeners();
        console.log('[Resonance Reef] Audio enabled');
        console.log(
          '[Resonance Reef] AudioContext after unlock:',
          {
            currentTime: this.context.currentTime,
            sampleRate: this.context.sampleRate,
            state: this.context.state,
          },
        );
        this.logGraphDiagnostics();

        if (DEBUG_AUDIO) {
          console.log(
            '[Resonance Reef] AudioContext resumed.',
          );
        }
      }
    } catch (error: unknown) {
      this.warnOnce(
        '[Resonance Reef] Audio resume failed.',
        error,
      );
    }
  }

  private playDiagnosticTone(): void {
    if (
      this.context == null ||
      this.diagnosticTonePlayed ||
      this.context.state !== 'running'
    ) {
      return;
    }

    this.diagnosticTonePlayed = true;

    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, now);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.setValueAtTime(0.04, now + 0.45);
    gain.gain.linearRampToValueAtTime(0.0001, now + 0.5);

    oscillator
      .connect(gain)
      .connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.5);

    console.log(
      '[Resonance Reef] Diagnostic tone played',
    );
  }

  private logGraphDiagnostics(): void {
    if (
      this.procedural == null ||
      this.graphDiagnosticsLogged
    ) {
      return;
    }

    this.graphDiagnosticsLogged = true;

    console.log(
      '[Resonance Reef] OceanAudio graph:',
      this.procedural.getDiagnosticSnapshot(),
    );
  }

  private updateListener(): void {
    if (this.context == null) {
      return;
    }

    try {
      this.world.camera.getWorldPosition(
        this.cameraPosition,
      );
      this.world.camera.getWorldDirection(
        this.cameraDirection,
      );
      this.world.camera.getWorldQuaternion(
        this.cameraQuaternion,
      );
      this.cameraUp
        .set(0, 1, 0)
        .applyQuaternion(this.cameraQuaternion);

      this.setListener(
        this.cameraPosition.x,
        this.cameraPosition.y,
        this.cameraPosition.z,
        this.cameraDirection.x,
        this.cameraDirection.y,
        this.cameraDirection.z,
        this.cameraUp.x,
        this.cameraUp.y,
        this.cameraUp.z,
      );
    } catch (error: unknown) {
      this.updateStationaryListener();

      if (!this.listenerFallbackLogged) {
        this.listenerFallbackLogged = true;
        this.warnOnce(
          '[Resonance Reef] Audio listener tracking unavailable; using stationary listener.',
          error,
        );
      }
    }
  }

  private updateStationaryListener(): void {
    this.setListener(
      this.stationaryPosition.x,
      this.stationaryPosition.y,
      this.stationaryPosition.z,
      0,
      0,
      -1,
      0,
      1,
      0,
    );
  }

  private setListener(
    x: number,
    y: number,
    z: number,
    forwardX: number,
    forwardY: number,
    forwardZ: number,
    upX: number,
    upY: number,
    upZ: number,
  ): void {
    if (this.context == null) {
      return;
    }

    const listener = this.context.listener;
    const now = this.context.currentTime;

    if (
      listener.positionX != null &&
      listener.positionY != null &&
      listener.positionZ != null &&
      listener.forwardX != null &&
      listener.forwardY != null &&
      listener.forwardZ != null &&
      listener.upX != null &&
      listener.upY != null &&
      listener.upZ != null
    ) {
      listener.positionX.setTargetAtTime(x, now, 0.04);
      listener.positionY.setTargetAtTime(y, now, 0.04);
      listener.positionZ.setTargetAtTime(z, now, 0.04);
      listener.forwardX.setTargetAtTime(
        forwardX,
        now,
        0.04,
      );
      listener.forwardY.setTargetAtTime(
        forwardY,
        now,
        0.04,
      );
      listener.forwardZ.setTargetAtTime(
        forwardZ,
        now,
        0.04,
      );
      listener.upX.setTargetAtTime(upX, now, 0.04);
      listener.upY.setTargetAtTime(upY, now, 0.04);
      listener.upZ.setTargetAtTime(upZ, now, 0.04);
    } else {
      listener.setPosition(x, y, z);
      listener.setOrientation(
        forwardX,
        forwardY,
        forwardZ,
        upX,
        upY,
        upZ,
      );
    }
  }

  private warnOnce(
    message: string,
    error?: unknown,
  ): void {
    if (this.warned) {
      return;
    }

    this.warned = true;
    console.warn(message, error ?? '');
  }
}
