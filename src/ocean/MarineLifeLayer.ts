import {
  AdditiveBlending,
  BufferGeometry,
  ConeGeometry,
  DodecahedronGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Points,
  PointsMaterial,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';

import type { BreathState } from '../breathing/BreathEngine.js';
import {
  MARINE_LIFE_CONFIG,
  MID_SCHOOL_BOUNDS,
} from './MarineLifeConfig.js';

interface MidFishState {
  angle: number;
  depthPhase: number;
  heightPhase: number;
  radiusScale: number;
  scale: number;
  speed: number;
}

interface FarFishState {
  baseAngle: number;
  distance: number;
  height: number;
  phase: number;
  scale: number;
  speed: number;
}

interface BubbleState {
  baseX: number;
  baseY: number;
  baseZ: number;
  driftPhase: number;
  height: number;
  speed: number;
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function smoothStep(value: number): number {
  const t = Math.max(0, Math.min(1, value));

  return t * t * (3 - 2 * t);
}

export class MarineLifeLayer {
  readonly root = new Group();

  readonly midFishCount =
    MARINE_LIFE_CONFIG.midFishCount;
  readonly farFishCount =
    MARINE_LIFE_CONFIG.farFishCount;
  readonly bubbleParticleCount =
    MARINE_LIFE_CONFIG.bubbleEmitterCount *
    MARINE_LIFE_CONFIG.bubbleParticlesPerEmitter;
  readonly detailCount =
    MARINE_LIFE_CONFIG.detailCount;

  private readonly midBodyMesh: InstancedMesh;
  private readonly midTailMesh: InstancedMesh;
  private readonly farFishMesh: InstancedMesh;
  private readonly bubbles: Points;
  private readonly bubblePositions =
    new Float32Array(this.bubbleParticleCount * 3);
  private readonly bubbleAttribute: Float32BufferAttribute;

  private readonly midFish: MidFishState[] = [];
  private readonly farFish: FarFishState[] = [];
  private readonly bubbleStates: BubbleState[] = [];
  private readonly fishForward = new Vector3(0, 1, 0);
  private readonly dummy = new Object3D();
  private readonly tempPosition = new Vector3();
  private readonly tempLook = new Vector3();
  private readonly tempScale = new Vector3();
  private readonly tailOffset = new Vector3();
  private readonly tailMatrix = new Matrix4();

  constructor() {
    this.root.name = 'ResonanceReefMarineLifeLayer';

    const midBodyGeometry =
      new IcosahedronGeometry(0.12, 0);
    const midTailGeometry =
      new ConeGeometry(0.07, 0.16, 3);
    const midMaterial =
      new MeshBasicMaterial({
        color: 0x2f6269,
        fog: true,
      });
    const midTailMaterial =
      new MeshBasicMaterial({
        color: 0x264f56,
        fog: true,
      });

    this.midBodyMesh = new InstancedMesh(
      midBodyGeometry,
      midMaterial,
      this.midFishCount,
    );
    this.midTailMesh = new InstancedMesh(
      midTailGeometry,
      midTailMaterial,
      this.midFishCount,
    );
    this.midBodyMesh.name = 'ReefMidDistanceFishBodies';
    this.midTailMesh.name = 'ReefMidDistanceFishTails';
    this.root.add(this.midBodyMesh, this.midTailMesh);

    this.farFishMesh = new InstancedMesh(
      new ConeGeometry(0.05, 0.22, 3),
      new MeshBasicMaterial({
        color: 0x061f26,
        fog: true,
      }),
      this.farFishCount,
    );
    this.farFishMesh.name = 'ReefFarFishSilhouettes';
    this.root.add(this.farFishMesh);

    const bubbleGeometry = new BufferGeometry();

    this.bubbleAttribute =
      new Float32BufferAttribute(
        this.bubblePositions,
        3,
      );
    bubbleGeometry.setAttribute(
      'position',
      this.bubbleAttribute,
    );
    this.bubbles = new Points(
      bubbleGeometry,
      new PointsMaterial({
        blending: AdditiveBlending,
        color: 0x9fd9d7,
        depthWrite: false,
        opacity: 0.18,
        size: 0.022,
        sizeAttenuation: true,
        transparent: true,
      }),
    );
    this.bubbles.name = 'ReefSparseBubbleTrails';
    this.root.add(this.bubbles);

    this.createMidFish();
    this.createFarFish();
    this.createBubbles();
    this.addSeabedDetails();
  }

  update(
    deltaSeconds: number,
    timeSeconds: number,
    breath: BreathState,
  ): void {
    this.updateMidFish(timeSeconds, breath);
    this.updateFarFish(timeSeconds);
    this.updateBubbles(deltaSeconds, timeSeconds);
  }

  private createMidFish(): void {
    for (
      let index = 0;
      index < this.midFishCount;
      index += 1
    ) {
      this.midFish.push({
        angle:
          (index / this.midFishCount) * Math.PI * 2 +
          randomRange(-0.28, 0.28),
        depthPhase: randomRange(0, Math.PI * 2),
        heightPhase: randomRange(0, Math.PI * 2),
        radiusScale: randomRange(0.78, 1.14),
        scale: randomRange(0.72, 0.98),
        speed: randomRange(0.07, 0.12),
      });
    }
  }

  private createFarFish(): void {
    for (
      let index = 0;
      index < this.farFishCount;
      index += 1
    ) {
      const schoolOffset =
        Math.floor(index / 9) * 0.55;

      this.farFish.push({
        baseAngle:
          randomRange(-Math.PI, Math.PI) +
          schoolOffset,
        distance: randomRange(
          MARINE_LIFE_CONFIG.farFishMinDistance,
          MARINE_LIFE_CONFIG.farFishMaxDistance,
        ),
        height: randomRange(1.2, 3.1),
        phase: randomRange(0, Math.PI * 2),
        scale: randomRange(0.52, 1.1),
        speed: randomRange(0.012, 0.032),
      });
    }
  }

  private createBubbles(): void {
    const emitters = [
      [-2.8, 0.18, -3.65],
      [2.55, 0.18, -4.85],
      [-1.4, 0.14, -6.55],
      [3.2, 0.16, -7.1],
    ] as const;

    for (
      let emitterIndex = 0;
      emitterIndex < MARINE_LIFE_CONFIG.bubbleEmitterCount;
      emitterIndex += 1
    ) {
      const emitter =
        emitters[emitterIndex % emitters.length];

      for (
        let bubbleIndex = 0;
        bubbleIndex < MARINE_LIFE_CONFIG.bubbleParticlesPerEmitter;
        bubbleIndex += 1
      ) {
        this.bubbleStates.push({
          baseX:
            emitter[0] + randomRange(-0.1, 0.1),
          baseY: emitter[1],
          baseZ:
            emitter[2] + randomRange(-0.08, 0.08),
          driftPhase: randomRange(0, Math.PI * 2),
          height: randomRange(0, 1.8),
          speed: randomRange(0.055, 0.105),
        });
      }
    }
  }

  private addSeabedDetails(): void {
    const shellGeometry =
      new SphereGeometry(0.06, 7, 4);
    const stoneGeometry =
      new DodecahedronGeometry(0.055, 0);
    const fragmentGeometry =
      new ConeGeometry(0.035, 0.14, 5);
    const shellMaterial =
      new MeshBasicMaterial({
        color: 0x817764,
        fog: true,
      });
    const stoneMaterial =
      new MeshBasicMaterial({
        color: 0x405a54,
        fog: true,
      });
    const fragmentMaterial =
      new MeshBasicMaterial({
        color: 0x496d66,
        fog: true,
      });
    const placements = [
      [-1.55, -0.015, -2.9, 0.9],
      [1.82, -0.012, -3.25, 0.72],
      [-2.75, -0.01, -4.72, 0.78],
      [2.95, -0.01, -5.25, 0.92],
      [-0.85, -0.018, -5.95, 0.64],
      [0.9, -0.018, -6.35, 0.7],
      [-3.6, -0.018, -6.9, 0.82],
      [3.65, -0.018, -7.25, 0.82],
      [-1.9, -0.02, 2.75, 0.55],
      [2.25, -0.02, 3.15, 0.58],
    ] as const;

    placements.forEach((placement, index) => {
      const mesh =
        index % 3 === 0
          ? new Mesh(shellGeometry, shellMaterial)
          : index % 3 === 1
            ? new Mesh(stoneGeometry, stoneMaterial)
            : new Mesh(
                fragmentGeometry,
                fragmentMaterial,
              );

      mesh.name = `ReefTinySeabedDetail-${index}`;
      mesh.position.set(
        placement[0],
        placement[1],
        placement[2],
      );
      mesh.scale.set(
        placement[3],
        0.22 + (index % 2) * 0.16,
        placement[3] * randomRange(0.7, 1.2),
      );
      mesh.rotation.set(
        randomRange(-0.12, 0.1),
        randomRange(0, Math.PI * 2),
        randomRange(-0.12, 0.12),
      );
      this.root.add(mesh);
    });
  }

  private updateMidFish(
    timeSeconds: number,
    breath: BreathState,
  ): void {
    const breathOffset =
      breath.phase === 'exhale'
        ? smoothStep(breath.progress) * 0.08
        : -smoothStep(breath.progress) * 0.045;

    for (
      let index = 0;
      index < this.midFish.length;
      index += 1
    ) {
      const fish = this.midFish[index];
      const angle =
        fish.angle + timeSeconds * fish.speed;
      const radiusX =
        MID_SCHOOL_BOUNDS.radiusX *
        fish.radiusScale *
        (1 + breathOffset);
      const radiusZ =
        MID_SCHOOL_BOUNDS.radiusZ *
        (0.86 + fish.radiusScale * 0.14) *
        (1 + breathOffset * 0.6);

      this.tempPosition.set(
        MID_SCHOOL_BOUNDS.center[0] +
          Math.cos(angle) * radiusX,
        MID_SCHOOL_BOUNDS.center[1] +
          Math.sin(
            timeSeconds * 0.31 + fish.heightPhase,
          ) *
            MID_SCHOOL_BOUNDS.radiusY,
        MID_SCHOOL_BOUNDS.center[2] +
          Math.sin(angle * 0.82 + fish.depthPhase) *
            radiusZ,
      );
      this.tempLook.set(
        -Math.sin(angle),
        Math.sin(timeSeconds * 0.2 + index) * 0.04,
        Math.cos(angle * 0.82),
      );

      this.dummy.position.copy(this.tempPosition);
      this.dummy.quaternion.setFromUnitVectors(
        this.fishForward,
        this.tempLook.normalize(),
      );
      this.tempScale.set(
        fish.scale * 1.45,
        fish.scale * 0.78,
        fish.scale * 0.52,
      );
      this.dummy.scale.copy(this.tempScale);
      this.dummy.updateMatrix();
      this.midBodyMesh.setMatrixAt(
        index,
        this.dummy.matrix,
      );

      this.tailOffset
        .set(0, -0.16 * fish.scale, 0)
        .applyQuaternion(this.dummy.quaternion)
        .add(this.tempPosition);
      this.dummy.position.copy(this.tailOffset);
      this.dummy.scale.setScalar(fish.scale);
      this.dummy.updateMatrix();
      this.tailMatrix.copy(this.dummy.matrix);
      this.midTailMesh.setMatrixAt(
        index,
        this.tailMatrix,
      );
    }

    this.midBodyMesh.instanceMatrix.needsUpdate = true;
    this.midTailMesh.instanceMatrix.needsUpdate = true;
  }

  private updateFarFish(timeSeconds: number): void {
    for (
      let index = 0;
      index < this.farFish.length;
      index += 1
    ) {
      const fish = this.farFish[index];
      const angle =
        fish.baseAngle +
        Math.sin(timeSeconds * fish.speed + fish.phase) *
          0.22;
      const lateral =
        Math.sin(timeSeconds * fish.speed * 0.7 + fish.phase) *
        1.2;

      this.tempPosition.set(
        Math.cos(angle) * fish.distance + lateral,
        fish.height +
          Math.sin(timeSeconds * 0.09 + fish.phase) *
            0.18,
        Math.sin(angle) * fish.distance,
      );
      this.tempLook.set(
        -Math.sin(angle),
        0.02,
        Math.cos(angle),
      );
      this.dummy.position.copy(this.tempPosition);
      this.dummy.quaternion.setFromUnitVectors(
        this.fishForward,
        this.tempLook.normalize(),
      );
      this.dummy.scale.setScalar(fish.scale);
      this.dummy.updateMatrix();
      this.farFishMesh.setMatrixAt(
        index,
        this.dummy.matrix,
      );
    }

    this.farFishMesh.instanceMatrix.needsUpdate = true;
  }

  private updateBubbles(
    deltaSeconds: number,
    timeSeconds: number,
  ): void {
    for (
      let index = 0;
      index < this.bubbleStates.length;
      index += 1
    ) {
      const bubble = this.bubbleStates[index];
      const offset = index * 3;

      bubble.height += bubble.speed * deltaSeconds;

      if (bubble.height > 2.2) {
        bubble.height = 0;
      }

      this.bubblePositions[offset] =
        bubble.baseX +
        Math.sin(
          timeSeconds * 0.42 + bubble.driftPhase,
        ) *
          0.055;
      this.bubblePositions[offset + 1] =
        bubble.baseY + bubble.height;
      this.bubblePositions[offset + 2] =
        bubble.baseZ +
        Math.cos(
          timeSeconds * 0.36 + bubble.driftPhase,
        ) *
          0.04;
    }

    this.bubbleAttribute.needsUpdate = true;
  }
}
