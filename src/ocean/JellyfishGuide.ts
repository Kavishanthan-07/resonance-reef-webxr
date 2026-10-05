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

  private readonly baseY = 1.55;

  constructor() {
    this.root.name = 'ResonanceReefJellyfishGuide';
    this.root.position.set(0, this.baseY, -2.4);
    this.root.scale.setScalar(0.65);

    /*
     * Main translucent bell.
     */
    this.bellMaterial = new MeshBasicMaterial({
      color: 0x60ddff,
      transparent: true,
      opacity: 0.52,
      side: DoubleSide,
      depthWrite: false,
      blending: AdditiveBlending,
    });

    const bellGeometry = new SphereGeometry(
      0.34,
      32,
      20,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.62,
    );

    this.bell = new Mesh(bellGeometry, this.bellMaterial);
    this.bell.name = 'JellyfishBell';
    this.bell.scale.set(1, 0.82, 1);

    this.root.add(this.bell);

    /*
     * Inner bioluminescent core.
     */
    this.coreMaterial = new MeshBasicMaterial({
      color: 0xb9f7ff,
      transparent: true,
      opacity: 0.42,
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
      color: 0x76e8ff,
      transparent: true,
      opacity: 0.35,
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
      color: 0x77d9ef,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: AdditiveBlending,
    });

    const tentacleCount = 8;

    for (let index = 0; index < tentacleCount; index += 1) {
      const angle = (index / tentacleCount) * Math.PI * 2;
      const radius = 0.145;

      const tentacle = new Mesh(
        new CylinderGeometry(
          0.007,
          0.014,
          0.58,
          6,
          1,
          true,
        ),
        tentacleMaterial,
      );

      tentacle.name = `JellyfishTentacle-${index}`;

      tentacle.position.set(
        Math.cos(angle) * radius,
        -0.42,
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

    this.coreMaterial.opacity = 0.28 + expansion * 0.34;
    this.bellMaterial.opacity = 0.42 + expansion * 0.16;

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
