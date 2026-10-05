import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
} from '@iwsdk/core';

import type { BreathState } from '../breathing/BreathEngine.js';
import type { SessionState } from '../experience/SessionController.js';
import type { CurrentSample } from './WaterCurrent.js';

const PLANKTON_COUNT = 250;
const X_MIN = -4;
const X_MAX = 4;
const Y_MIN = 0.5;
const Y_MAX = 3.5;
const Z_MIN = -7;
const Z_MAX = -0.5;
const BREATH_ZONE_X = 0;
const BREATH_ZONE_Y = 1.55;
const BREATH_ZONE_Z = -2.8;
const USER_X = 0;
const USER_Y = 1.6;
const USER_Z = 0;
const USER_EXCLUSION_RADIUS = 0.78;

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function smoothStep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export class BioluminescentPlankton {
  readonly points: Points;

  readonly count = PLANKTON_COUNT;

  private readonly positions =
    new Float32Array(PLANKTON_COUNT * 3);
  private readonly velocities =
    new Float32Array(PLANKTON_COUNT * 3);
  private readonly targets =
    new Float32Array(PLANKTON_COUNT * 3);
  private readonly driftSpeeds =
    new Float32Array(PLANKTON_COUNT);
  private readonly phaseOffsets =
    new Float32Array(PLANKTON_COUNT);
  private readonly material: PointsMaterial;
  private readonly positionAttribute: Float32BufferAttribute;
  private sessionIntensity = 0.74;

  constructor() {
    this.randomizeParticles();

    const geometry = new BufferGeometry();

    this.positionAttribute =
      new Float32BufferAttribute(this.positions, 3);
    geometry.setAttribute(
      'position',
      this.positionAttribute,
    );

    this.material =
      new PointsMaterial({
        blending: AdditiveBlending,
        color: 0x60d7cf,
        depthWrite: false,
        opacity: 0.175,
        size: 0.018,
        sizeAttenuation: true,
        transparent: true,
      });

    this.points = new Points(
      geometry,
      this.material,
    );

    this.points.name = 'ResonanceReefBioluminescentPlankton';
  }

  reset(): void {
    this.randomizeParticles();
    this.sessionIntensity = 0.74;
    this.material.opacity = 0.175;
    this.positionAttribute.needsUpdate = true;
  }

  setSessionIntensity(value: number): void {
    this.sessionIntensity = clamp(value, 0.72, 1);
    const sessionLift =
      clamp01((this.sessionIntensity - 0.72) / 0.28);

    this.material.opacity =
      0.17 + sessionLift * 0.042;
  }

  update(
    state: BreathState,
    current: CurrentSample,
    deltaSeconds: number,
    timeSeconds: number,
    session?: SessionState,
  ): void {
    if (session != null) {
      this.setSessionIntensity(
        session.environmentIntensity,
      );
    }

    const sessionLift =
      clamp01((this.sessionIntensity - 0.72) / 0.28);
    const responseScale =
      0.94 + sessionLift * 0.18;
    const inhaleStrength =
      state.phase === 'inhale'
        ? (0.026 + smoothStep(state.progress) * 0.052) *
          responseScale
        : 0;
    const currentActive =
      current.phase === 'expanding' &&
      current.strength > 0.002;

    for (let index = 0; index < PLANKTON_COUNT; index += 1) {
      const offset = index * 3;
      let x = this.positions[offset];
      let y = this.positions[offset + 1];
      let z = this.positions[offset + 2];
      let vx = this.velocities[offset];
      let vy = this.velocities[offset + 1];
      let vz = this.velocities[offset + 2];
      const phase = this.phaseOffsets[index];

      vx +=
        Math.sin(timeSeconds * 0.2 + phase) *
        deltaSeconds *
        0.006;
      vy +=
        this.driftSpeeds[index] *
        deltaSeconds *
        0.34;
      vz +=
        Math.cos(timeSeconds * 0.16 + phase) *
        deltaSeconds *
        0.005;

      if (inhaleStrength > 0) {
        let dx = this.targets[offset] - x;
        let dy = this.targets[offset + 1] - y;
        let dz = this.targets[offset + 2] - z;
        const distance =
          Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance > 0.001) {
          dx /= distance;
          dy /= distance;
          dz /= distance;

          const acceleration =
            inhaleStrength * deltaSeconds;

          vx += dx * acceleration;
          vy += dy * acceleration * 0.55;
          vz += dz * acceleration;
        }
      }

      if (currentActive) {
        let dx = x - current.origin.x;
        let dy = y - current.origin.y;
        let dz = z - current.origin.z;
        const distance =
          Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance > 0.001) {
          const shellOffset =
            Math.abs(distance - current.radius);

          if (shellOffset < current.shellThickness) {
            dx /= distance;
            dy /= distance;
            dz /= distance;

            const shellFalloff =
              1 - shellOffset / current.shellThickness;
            const forwardBias =
              0.62 + Math.max(0, -dz) * 0.38;
            const acceleration =
              shellFalloff *
              current.strength *
              forwardBias *
              responseScale *
              deltaSeconds *
              0.46;

            vx += dx * acceleration;
            vy += dy * acceleration * 0.42;
            vz += dz * acceleration;
          }
        }
      }

      const userDx = x - USER_X;
      const userDy = y - USER_Y;
      const userDz = z - USER_Z;
      const userDistance =
        Math.sqrt(
          userDx * userDx +
            userDy * userDy +
            userDz * userDz,
        );

      if (
        userDistance < USER_EXCLUSION_RADIUS &&
        userDistance > 0.001
      ) {
        const push =
          (USER_EXCLUSION_RADIUS - userDistance) *
          deltaSeconds *
          0.38;

        vx += (userDx / userDistance) * push;
        vy += (userDy / userDistance) * push;
        vz += (userDz / userDistance) * push;
      }

      vx *= Math.pow(0.965, deltaSeconds * 60);
      vy *= Math.pow(0.958, deltaSeconds * 60);
      vz *= Math.pow(0.965, deltaSeconds * 60);

      x += vx * deltaSeconds;
      y += vy * deltaSeconds;
      z += vz * deltaSeconds;

      if (x > X_MAX) {
        x = X_MIN;
      } else if (x < X_MIN) {
        x = X_MAX;
      }

      if (y > Y_MAX) {
        y = Y_MIN;
      } else if (y < Y_MIN) {
        y = Y_MAX;
      }

      if (z > Z_MAX) {
        z = Z_MIN;
      } else if (z < Z_MIN) {
        z = Z_MAX;
      }

      this.positions[offset] = x;
      this.positions[offset + 1] = y;
      this.positions[offset + 2] = z;
      this.velocities[offset] = clamp(vx, -0.22, 0.22);
      this.velocities[offset + 1] = clamp(vy, -0.16, 0.16);
      this.velocities[offset + 2] = clamp(vz, -0.24, 0.24);
    }

    this.positionAttribute.needsUpdate = true;
  }

  private randomizeParticles(): void {
    for (let index = 0; index < PLANKTON_COUNT; index += 1) {
      const offset = index * 3;

      this.positions[offset] = randomRange(X_MIN, X_MAX);
      this.positions[offset + 1] = randomRange(Y_MIN, Y_MAX);
      this.positions[offset + 2] = randomRange(Z_MIN, Z_MAX);
      this.velocities[offset] = 0;
      this.velocities[offset + 1] = 0;
      this.velocities[offset + 2] = 0;

      this.targets[offset] =
        BREATH_ZONE_X + randomRange(-1.15, 1.15);
      this.targets[offset + 1] =
        BREATH_ZONE_Y + randomRange(-0.65, 0.72);
      this.targets[offset + 2] =
        BREATH_ZONE_Z + randomRange(-1.05, 0.82);

      this.driftSpeeds[index] =
        randomRange(0.006, 0.018);
      this.phaseOffsets[index] =
        Math.random() * Math.PI * 2;
    }
  }
}
