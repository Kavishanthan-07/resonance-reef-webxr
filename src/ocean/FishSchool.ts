import {
  AnimationClip,
  Color,
  Group,
  MathUtils,
  Vector3,
} from '@iwsdk/core';

import type { BreathState } from '../breathing/BreathEngine.js';
import type { SessionState } from '../experience/SessionController.js';
import { FishAgent } from './FishAgent.js';
import type { FishVisualStyle } from './FishAgent.js';
import type { CurrentSample } from './WaterCurrent.js';

interface FishSpeciesConfig {
  headingOffsetY: number;
  modelScale: number;
}

interface FishSchoolConfig {
  count?: number;
  species?: FishSpeciesConfig;
  swimClip: AnimationClip | null;
  visualFactory: () => Group;
  visualStyle?: FishVisualStyle;
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function smoothStep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

const DEFAULT_SPECIES: FishSpeciesConfig = {
  headingOffsetY: 0,
  modelScale: 0.105,
};
const SUPPORT_FISH_PALETTE = [
  0x5f9f9a,
  0x4f8f98,
  0x6aa8a1,
  0x508a84,
  0x76aaa5,
] as const;
const SUPPORT_FISH_ACCENTS = [
  0x96d0c2,
  0x86beb7,
  0xa2d4c9,
] as const;

/**
 * Breath-responsive GLB fish school.
 *
 * Behaviour remains procedural and lightweight; visuals come from one
 * skeleton-safe GLB clone per agent.
 */
export class FishSchool {
  readonly root = new Group();

  readonly fishCount: number;
  readonly headingOffsetY: number;
  readonly modelScale: number;

  private readonly fish: FishAgent[] = [];

  private readonly userPoint = new Vector3(0, 1.6, 0);
  private readonly guideCenter = new Vector3(0, 1.68, -4.7);
  private readonly reefCenter = new Vector3(0, 1.5, -5.2);
  private readonly jellyfishExclusionRadius = 0.9;
  private readonly userExclusionRadius = 0.95;

  private readonly centroid = new Vector3();
  private readonly averageVelocity = new Vector3();
  private readonly steering = new Vector3();
  private readonly separation = new Vector3();
  private readonly difference = new Vector3();
  private readonly breathForce = new Vector3();
  private readonly boundaryForce = new Vector3();
  private readonly comfortForce = new Vector3();
  private readonly guideComfortForce = new Vector3();
  private readonly currentForce = new Vector3();
  private readonly lookTarget = new Vector3();

  constructor(config: FishSchoolConfig) {
    const count = config.count ?? 10;
    const species = {
      ...DEFAULT_SPECIES,
      ...config.species,
    };

    this.fishCount = count;
    this.headingOffsetY = species.headingOffsetY;
    this.modelScale = species.modelScale;
    this.root.name = 'ResonanceReefFishSchool';

    for (let index = 0; index < count; index += 1) {
      const fishRoot = new Group();
      const visual = config.visualFactory();

      fishRoot.name = `Fish-${index}`;
      fishRoot.position.set(
        randomRange(-2.25, 2.25),
        randomRange(0.9, 2.35),
        randomRange(-6.8, -3.5),
      );

      const agent = new FishAgent({
        gatherOffset: this.createGatherOffset(index),
        headingOffsetY: species.headingOffsetY,
        modelScale:
          species.modelScale * randomRange(0.82, 1.12),
        outwardBias: this.createOutwardBias(index),
        phaseOffset: Math.random() * Math.PI * 2,
        root: fishRoot,
        swimClip: config.swimClip,
        visual,
        visualStyle: config.visualStyle,
        paletteTint: new Color(
          SUPPORT_FISH_PALETTE[
            index % SUPPORT_FISH_PALETTE.length
          ],
        ),
        breathAccentColor: new Color(
          SUPPORT_FISH_ACCENTS[
            index % SUPPORT_FISH_ACCENTS.length
          ],
        ),
      });

      agent.velocity
        .set(
          randomRange(-0.15, 0.15),
          randomRange(-0.04, 0.04),
          randomRange(-0.35, -0.12),
        )
        .normalize()
        .multiplyScalar(randomRange(0.18, 0.3));

      this.fish.push(agent);
      this.root.add(fishRoot);
    }
  }

  private createGatherOffset(index: number): Vector3 {
    const angle =
      (index / Math.max(1, this.fishCount)) * Math.PI * 2 +
      randomRange(-0.38, 0.38);
    const radius = randomRange(1.1, 1.8);
    const depthOffset =
      index % 3 === 0
        ? randomRange(-1.35, -0.42)
        : index % 3 === 1
          ? randomRange(-0.36, 0.28)
          : randomRange(0.18, 0.88);

    return new Vector3(
      Math.cos(angle) * radius,
      randomRange(-0.7, 0.8),
      depthOffset,
    );
  }

  private createOutwardBias(index: number): Vector3 {
    const side =
      index % 3 === 0
        ? -1
        : index % 3 === 1
          ? 1
          : Math.sign(randomRange(-1, 1)) || 1;

    return new Vector3(
      side * randomRange(0.38, 1.15),
      randomRange(-0.58, 0.62),
      randomRange(-1.15, -0.24),
    ).normalize();
  }

  update(
    state: BreathState,
    deltaSeconds: number,
    timeSeconds: number,
    current?: CurrentSample,
    session?: SessionState,
  ): void {
    if (this.fish.length === 0) {
      return;
    }

    this.centroid.set(0, 0, 0);
    this.averageVelocity.set(0, 0, 0);

    for (const agent of this.fish) {
      this.centroid.add(agent.root.position);
      this.averageVelocity.add(agent.velocity);
    }

    this.centroid.multiplyScalar(1 / this.fish.length);

    if (this.averageVelocity.lengthSq() > 0.0001) {
      this.averageVelocity
        .multiplyScalar(1 / this.fish.length)
        .normalize();
    }

    const breathProgress = smoothStep(state.progress);
    const environmentIntensity =
      session?.environmentIntensity ?? 1;
    const sessionLift =
      Math.max(
        0,
        Math.min(1, (environmentIntensity - 0.72) / 0.28),
      );
    const gatherScale =
      0.94 + sessionLift * 0.12;
    const spreadScale =
      0.94 + sessionLift * 0.12;
    const exhaleBoost =
      state.phase === 'exhale'
        ? 1 + breathProgress * 0.28 * spreadScale
        : 1;

    for (
      let fishIndex = 0;
      fishIndex < this.fish.length;
      fishIndex += 1
    ) {
      const agent = this.fish[fishIndex];

      this.steering.set(0, 0, 0);
      this.separation.set(0, 0, 0);

      this.difference
        .copy(this.centroid)
        .sub(agent.root.position);

      if (this.difference.lengthSq() > 0.0001) {
        this.steering.addScaledVector(
          this.difference.normalize(),
          0.18,
        );
      }

      if (this.averageVelocity.lengthSq() > 0.0001) {
        this.steering.addScaledVector(
          this.averageVelocity,
          0.08,
        );
      }

      for (
        let otherIndex = 0;
        otherIndex < this.fish.length;
        otherIndex += 1
      ) {
        if (otherIndex === fishIndex) {
          continue;
        }

        const other = this.fish[otherIndex];

        this.difference
          .copy(agent.root.position)
          .sub(other.root.position);

        const distanceSquared =
          this.difference.lengthSq();

        if (
          distanceSquared > 0 &&
          distanceSquared < 0.18
        ) {
          this.difference
            .normalize()
            .multiplyScalar(
              1 / Math.max(distanceSquared, 0.025),
            );

          this.separation.add(this.difference);
        }
      }

      if (this.separation.lengthSq() > 0) {
        this.steering.addScaledVector(
          this.separation.normalize(),
          0.58,
        );
      }

      if (state.phase === 'inhale') {
        this.breathForce
          .copy(this.guideCenter)
          .add(agent.gatherOffset)
          .sub(agent.root.position);

        if (this.breathForce.lengthSq() > 0.001) {
          this.steering.addScaledVector(
            this.breathForce.normalize(),
            (0.62 + breathProgress * 0.8) * gatherScale,
          );
        }
      } else {
        this.breathForce
          .copy(agent.root.position)
          .sub(this.userPoint);

        if (this.breathForce.lengthSq() > 0.001) {
          this.steering.addScaledVector(
            this.breathForce.normalize(),
            (0.7 + breathProgress * 1.2) * spreadScale,
          );
        }

        this.steering.addScaledVector(
          agent.outwardBias,
          (0.45 + breathProgress * 0.58) * spreadScale,
        );
      }

      if (
        current != null &&
        current.phase === 'expanding' &&
        current.strength > 0.002
      ) {
        this.currentForce
          .copy(agent.root.position)
          .sub(current.origin);

        const currentDistance =
          this.currentForce.length();
        const shellOffset =
          Math.abs(currentDistance - current.radius);

        if (
          currentDistance > 0.001 &&
          shellOffset < current.shellThickness
        ) {
          const shellFalloff =
            1 - shellOffset / current.shellThickness;
          const forwardBias =
            0.68 +
            Math.max(
              0,
              -this.currentForce.z / currentDistance,
            ) *
              0.32;
          const individualBias =
            0.82 +
            Math.sin(agent.phaseOffset) * 0.16;

          this.steering.addScaledVector(
            this.currentForce.normalize(),
            shellFalloff *
              current.strength *
              forwardBias *
              individualBias *
              (0.94 + sessionLift * 0.12) *
              0.46,
          );
        }
      }

      this.guideComfortForce
        .copy(agent.root.position)
        .sub(this.guideCenter);

      const guideDistance =
        this.guideComfortForce.length();

      if (
        guideDistance < this.jellyfishExclusionRadius &&
        guideDistance > 0.001
      ) {
        this.steering.addScaledVector(
          this.guideComfortForce.normalize(),
          (this.jellyfishExclusionRadius - guideDistance) * 2.6,
        );
      }

      this.comfortForce
        .copy(agent.root.position)
        .sub(this.userPoint);

      const userDistance =
        this.comfortForce.length();

      if (
        userDistance < this.userExclusionRadius &&
        userDistance > 0.001
      ) {
        this.steering.addScaledVector(
          this.comfortForce.normalize(),
          (this.userExclusionRadius - userDistance) * 2.2,
        );
      }

      const outsideBoundary =
      Math.abs(agent.root.position.x) > 4.2 ||
        agent.root.position.y < 0.35 ||
        agent.root.position.y > 3.1 ||
        agent.root.position.z < -7.4 ||
        agent.root.position.z > -2.8;

      if (outsideBoundary) {
        this.boundaryForce
          .copy(this.reefCenter)
          .sub(agent.root.position);

        if (this.boundaryForce.lengthSq() > 0.001) {
          this.steering.addScaledVector(
            this.boundaryForce.normalize(),
            1.35,
          );
        }
      }

      agent.velocity.addScaledVector(
        this.steering,
        deltaSeconds,
      );

      const maxSpeed =
        state.phase === 'inhale' ? 0.58 : 0.95;
      const minSpeed =
        state.phase === 'inhale' ? 0.1 : 0.16;
      const currentSpeed =
        agent.velocity.length();

      if (currentSpeed > maxSpeed) {
        agent.velocity.setLength(maxSpeed);
      } else if (currentSpeed < minSpeed && currentSpeed > 0) {
        agent.velocity.setLength(minSpeed);
      }

      const damping = Math.pow(
        0.986,
        deltaSeconds * 60,
      );

      agent.velocity.multiplyScalar(damping);

      agent.root.position.addScaledVector(
        agent.velocity,
        deltaSeconds * exhaleBoost,
      );

      agent.root.position.y +=
        Math.sin(
          timeSeconds * 1.25 +
            agent.phaseOffset,
        ) *
        0.00042;

      if (agent.velocity.lengthSq() > 0.0001) {
        this.lookTarget
          .copy(agent.root.position)
          .add(agent.velocity);

        agent.root.lookAt(this.lookTarget);
        agent.root.rotation.y += agent.headingOffsetY;
        agent.root.rotation.z +=
          MathUtils.clamp(
            -agent.velocity.x * 0.35,
            -0.18,
            0.18,
          );
      }

      agent.updateAnimation(deltaSeconds, state);
    }
  }

  reset(): void {
    for (
      let index = 0;
      index < this.fish.length;
      index += 1
    ) {
      const agent = this.fish[index];

      agent.root.position.set(
        randomRange(-2.25, 2.25),
        randomRange(0.9, 2.35),
        randomRange(-6.8, -3.5),
      );
      agent.velocity
        .set(
          randomRange(-0.15, 0.15),
          randomRange(-0.04, 0.04),
          randomRange(-0.35, -0.12),
        )
        .normalize()
        .multiplyScalar(randomRange(0.18, 0.3));
    }
  }
}
