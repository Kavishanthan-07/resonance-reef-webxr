import {
  AdditiveBlending,
  Group,
  Mesh,
  MeshBasicMaterial,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';

import type {
  BreathPhase,
  BreathState,
} from '../breathing/BreathEngine.js';

export interface CurrentSample {
  origin: Vector3;
  radius: number;
  shellThickness: number;
  strength: number;
  phase: 'inactive' | 'expanding';
}

const DEBUG_CURRENT = false;

const START_RADIUS = 0.3;
const MAX_RADIUS = 6.2;
const BASE_STRENGTH = 0.34;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothStep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export class WaterCurrent {
  readonly root = new Group();

  readonly origin = new Vector3(0, 1.4, -0.2);

  readonly maxRadius = MAX_RADIUS;

  readonly shellThickness = 0.65;

  private readonly sample: CurrentSample = {
    origin: this.origin,
    radius: START_RADIUS,
    shellThickness: this.shellThickness,
    strength: 0,
    phase: 'inactive',
  };

  private readonly ringMaterial: MeshBasicMaterial;
  private readonly ring: Mesh;

  private previousPhase: BreathPhase | null = null;
  private active = false;
  private pulseAge = 0;

  constructor() {
    this.root.name = 'ResonanceReefWaterCurrent';

    this.ringMaterial = new MeshBasicMaterial({
      blending: AdditiveBlending,
      color: 0x65d6df,
      depthWrite: false,
      opacity: 0,
      transparent: true,
    });

    this.ring = new Mesh(
      new TorusGeometry(1, 0.012, 8, 72),
      this.ringMaterial,
    );

    this.ring.name = 'ResonanceReefExhaleCurrentRing';
    this.ring.position.copy(this.origin);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.visible = false;

    this.root.add(this.ring);
  }

  update(
    state: BreathState,
    deltaSeconds: number,
  ): CurrentSample {
    if (
      this.previousPhase === 'inhale' &&
      state.phase === 'exhale'
    ) {
      this.startPulse();
    }

    if (this.active) {
      if (state.phase === 'exhale') {
        this.pulseAge += Math.max(0, deltaSeconds);

        const progress =
          state.phaseDuration > 0
            ? clamp01(this.pulseAge / state.phaseDuration)
            : 1;

        this.sample.radius =
          START_RADIUS +
          (MAX_RADIUS - START_RADIUS) *
            smoothStep(progress);
        this.sample.strength =
          BASE_STRENGTH *
          (1 - progress) *
          (0.45 + 0.55 * smoothStep(state.progress));

        if (progress >= 1) {
          this.active = false;
        }
      } else {
        this.sample.strength *= Math.pow(
          0.82,
          deltaSeconds * 60,
        );

        if (this.sample.strength < 0.004) {
          this.active = false;
        }
      }
    }

    if (!this.active) {
      this.sample.strength = 0;
      this.sample.phase = 'inactive';
    } else {
      this.sample.phase = 'expanding';
    }

    this.updateVisual();
    this.previousPhase = state.phase;

    return this.sample;
  }

  private startPulse(): void {
    this.active = true;
    this.pulseAge = 0;
    this.sample.radius = START_RADIUS;
    this.sample.strength = BASE_STRENGTH * 0.4;
    this.sample.phase = 'expanding';

    if (DEBUG_CURRENT) {
      console.log(
        '[Resonance Reef] Exhale current pulse started.',
      );
    }
  }

  private updateVisual(): void {
    const opacityScale = DEBUG_CURRENT ? 3.5 : 1;
    const visible =
      this.sample.phase === 'expanding' &&
      this.sample.strength > 0.006;

    this.ring.visible = visible;

    if (!visible) {
      this.ringMaterial.opacity = 0;
      return;
    }

    this.ring.scale.setScalar(this.sample.radius);
    this.ring.position.set(
      this.origin.x,
      this.origin.y,
      this.origin.z - this.sample.radius * 0.34,
    );
    this.ringMaterial.opacity =
      Math.min(
        DEBUG_CURRENT ? 0.22 : 0.045,
        this.sample.strength * 0.09 * opacityScale,
      );
  }
}
