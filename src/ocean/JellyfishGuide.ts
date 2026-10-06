import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  TorusGeometry,
} from '@iwsdk/core';

import type { BreathState } from '../breathing/BreathEngine.js';

function smoothStep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function createOrganicBellGeometry(): SphereGeometry {
  const geometry = new SphereGeometry(
    0.34,
    40,
    24,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.62,
  );
  const position =
    geometry.getAttribute('position');

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const angle = Math.atan2(z, x);
    const lowerBell = smoothStep((0.12 - y) / 0.32);
    const wobble =
      1 +
      Math.sin(angle * 5 + y * 16) *
        0.025 *
        lowerBell;
    const rimFlare = 1 + lowerBell * 0.26;

    position.setXYZ(
      index,
      x * rimFlare * wobble,
      y * (0.92 - lowerBell * 0.08),
      z * rimFlare * wobble,
    );
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}

function createTentacleGeometry(
  length: number,
  phase: number,
): CylinderGeometry {
  const geometry = new CylinderGeometry(
    0.003,
    0.012,
    length,
    5,
    5,
    true,
  );
  const position =
    geometry.getAttribute('position');

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const down =
      smoothStep((length * 0.5 - y) / length);
    const bend =
      Math.sin(down * Math.PI + phase) *
      0.035 *
      down;

    position.setXYZ(
      index,
      x + bend,
      y,
      z + Math.cos(phase) * 0.018 * down,
    );
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Procedural bioluminescent breathing guide.
 *
 * No external GLTF model is required.
 */
export class JellyfishGuide {
  readonly root = new Group();

  private readonly bell: Mesh;
  private readonly core: Mesh;
  private readonly ring: Mesh;
  private readonly tentacles: Mesh[] = [];

  private readonly bellMaterial: MeshBasicMaterial;
  private readonly coreMaterial: MeshBasicMaterial;

  private readonly baseY = 1.68;

  constructor() {
    this.root.name = 'ResonanceReefJellyfishGuide';
    this.root.position.set(0, this.baseY, -2.3);
    this.root.scale.setScalar(0.62);

    /*
     * Main translucent bell.
     */
    this.bellMaterial = new MeshBasicMaterial({
      color: 0x79d7df,
      transparent: true,
      opacity: 0.24,
      side: DoubleSide,
      depthWrite: false,
      blending: AdditiveBlending,
    });

    const bellGeometry = createOrganicBellGeometry();

    this.bell = new Mesh(bellGeometry, this.bellMaterial);
    this.bell.name = 'JellyfishBell';
    this.bell.scale.set(1, 0.82, 1);

    this.root.add(this.bell);

    /*
     * Inner bioluminescent core.
     */
    this.coreMaterial = new MeshBasicMaterial({
      color: 0xbdecef,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: AdditiveBlending,
    });

    this.core = new Mesh(
      new SphereGeometry(0.14, 20, 12),
      this.coreMaterial,
    );

    this.core.name = 'JellyfishCore';
    this.core.position.y = 0.02;

    this.root.add(this.core);

    /*
     * Soft glowing rim under the bell.
     */
    const ringMaterial = new MeshBasicMaterial({
      color: 0x8cdde0,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      blending: AdditiveBlending,
    });

    this.ring = new Mesh(
      new TorusGeometry(0.255, 0.018, 8, 36),
      ringMaterial,
    );

    this.ring.name = 'JellyfishRim';
    this.ring.position.y = -0.105;
    this.ring.rotation.x = Math.PI / 2;

    this.root.add(this.ring);

    /*
     * Procedural tentacles.
     */
    const tentacleMaterial = new MeshBasicMaterial({
      color: 0x82cfd8,
      transparent: true,
      opacity: 0.17,
      depthWrite: false,
      blending: AdditiveBlending,
    });

    const tentacleCount = 8;

    for (let index = 0; index < tentacleCount; index += 1) {
      const angle = (index / tentacleCount) * Math.PI * 2;
      const radius = 0.145;

      const tentacleLength =
        0.54 + (index % 3) * 0.055;
      const tentacle = new Mesh(
        createTentacleGeometry(
          tentacleLength,
          index * 0.72,
        ),
        tentacleMaterial,
      );

      tentacle.name = `JellyfishTentacle-${index}`;

      tentacle.position.set(
        Math.cos(angle) * radius,
        -0.39 - tentacleLength * 0.08,
        Math.sin(angle) * radius,
      );

      this.tentacles.push(tentacle);
      this.root.add(tentacle);
    }
  }

  update(state: BreathState, timeSeconds: number): void {
    const easedProgress = smoothStep(state.progress);

    /*
     * Convert inhale/exhale into one continuous expansion value:
     *
     * inhale: 0 -> 1
     * exhale: 1 -> 0
     */
    const expansion =
      state.phase === 'inhale'
        ? easedProgress
        : 1 - easedProgress;

    /*
     * Bell breath animation.
     */
    const horizontalScale = 0.94 + expansion * 0.15;
    const verticalScale = 0.74 + expansion * 0.16;

    this.bell.scale.set(
      horizontalScale,
      verticalScale,
      horizontalScale,
    );

    /*
     * Inner light grows during inhale and softens during exhale.
     */
    const coreScale = 0.88 + expansion * 0.24;
    this.core.scale.setScalar(coreScale);

    this.coreMaterial.opacity = 0.12 + expansion * 0.13;
    this.bellMaterial.opacity = 0.18 + expansion * 0.07;

    const ringScale = 0.95 + expansion * 0.11;
    this.ring.scale.setScalar(ringScale);

    /*
     * Gentle neutral ocean motion.
     */
    this.root.position.y =
      this.baseY + Math.sin(timeSeconds * 0.8) * 0.035;

    this.root.rotation.y =
      Math.sin(timeSeconds * 0.25) * 0.12;

    /*
     * Independent tentacle movement prevents the guide from looking
     * like a rigid mechanical animation.
     */
    this.tentacles.forEach((tentacle, index) => {
      const phaseOffset = index * 0.72;

      tentacle.rotation.z =
        Math.sin(timeSeconds * 1.25 + phaseOffset) * 0.075;

      tentacle.rotation.x =
        Math.cos(timeSeconds * 1.05 + phaseOffset) * 0.055;

      tentacle.scale.y =
        0.92 + (1 - expansion) * 0.1;
    });
  }
}
