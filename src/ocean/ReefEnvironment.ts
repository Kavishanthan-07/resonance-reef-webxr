import {
  AdditiveBlending,
  AmbientLight,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  type Scene,
  type Texture,
  type World,
} from '@iwsdk/core';

import type { BreathState } from '../breathing/BreathEngine.js';
import type { SessionState } from '../experience/SessionController.js';
import { MarineLifeLayer } from './MarineLifeLayer.js';
import { ReefDecorLayer } from './ReefDecorLayer.js';
import type {
  CoralTarget,
  SwayTarget,
} from './ReefResponseTargets.js';
import {
  UnderwaterAtmosphere,
  UNDERWATER_ATMOSPHERE_CONFIG,
} from './UnderwaterAtmosphere.js';
import { UnderwaterParticles } from './UnderwaterParticles.js';
import type { CurrentSample } from './WaterCurrent.js';

const DEBUG_REEF_CURRENT = false;
const RESPONSE_DECAY_SECONDS = 1.6;
const SEABED_SIZE_METERS = 100;
const SEABED_SEGMENTS = 24;
const SEABED_COMFORT_RADIUS = 1.2;
const SEABED_VARIATION_FADE_RADIUS = 3.4;

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothStep(value: number): number {
  const t = clamp01(value);

  return t * t * (3 - 2 * t);
}

function createSeabedGeometry(): PlaneGeometry {
  const geometry = new PlaneGeometry(
    SEABED_SIZE_METERS,
    SEABED_SIZE_METERS,
    SEABED_SEGMENTS,
    SEABED_SEGMENTS,
  );
  const position =
    geometry.getAttribute('position');

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const distanceFromUser =
      Math.sqrt(x * x + y * y);
    const comfortFade = smoothStep(
      (distanceFromUser - SEABED_COMFORT_RADIUS) /
        (SEABED_VARIATION_FADE_RADIUS -
          SEABED_COMFORT_RADIUS),
    );
    const height =
      (
        Math.sin(x * 0.13 + y * 0.08) * 0.16 +
        Math.cos(x * 0.045 - y * 0.12) * 0.11 +
        Math.sin((x + y) * 0.06) * 0.08
      ) *
      comfortFade;

    position.setZ(index, height);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}

function setNoShadows(object: Group): void {
  object.traverse((child) => {
    child.castShadow = false;
    child.receiveShadow = false;
  });
}

export class ReefEnvironment {
  readonly root = new Group();

  readonly rockCount = 10;
  readonly vegetationCount = 10;
  readonly coralClusterCount = 8;
  readonly lightShaftCount = 3;
  readonly particleCount = 180;
  readonly approximateMeshCount = 125;

  private readonly previousBackground:
    | Color
    | Texture
    | null;
  private readonly previousFog: Scene['fog'];
  private readonly swayTargets: SwayTarget[] = [];
  private readonly coralTargets: CoralTarget[] = [];
  private readonly decorLayer: ReefDecorLayer;
  private readonly atmosphere: UnderwaterAtmosphere;
  private readonly marineLife: MarineLifeLayer;
  private readonly particles: UnderwaterParticles;
  private readonly coralGlowColor = new Color(0x67d9d1);

  constructor(private readonly world: World) {
    this.root.name = 'ResonanceReefEnvironment';

    this.previousBackground =
      world.scene.background;
    this.previousFog =
      world.scene.fog;

    world.scene.background =
      new Color(0x041c29);
    world.scene.fog =
      new Fog(
        0x052f3b,
        UNDERWATER_ATMOSPHERE_CONFIG.fogNear,
        UNDERWATER_ATMOSPHERE_CONFIG.fogFar,
      );

    this.addLighting();
    this.atmosphere =
      new UnderwaterAtmosphere();
    this.marineLife =
      new MarineLifeLayer();
    this.decorLayer =
      new ReefDecorLayer({
        coralTargets: this.coralTargets,
        swayTargets: this.swayTargets,
      });

    this.addSeabed();
    this.addRocks();
    this.addCoral();
    this.addVegetation();
    this.root.add(this.atmosphere.root);
    this.root.add(this.marineLife.root);
    this.root.add(this.decorLayer.root);
    void this.decorLayer
      .load()
      .catch((error: unknown) => {
        console.warn(
          '[Resonance Reef] Failed to load imported reef decor.',
          error,
        );
      });

    this.particles =
      new UnderwaterParticles({
        count: this.particleCount,
        xRange: [-5.0, 5.0],
        yRange: [0.55, 5.4],
        zRange: [-10.5, -0.9],
      });

    this.root.add(this.particles.points);
    setNoShadows(this.root);
  }

  update(
    deltaSeconds: number,
    timeSeconds: number,
    current?: CurrentSample,
    session?: SessionState,
    breath?: BreathState,
  ): void {
    const environmentIntensity =
      session?.environmentIntensity ?? 1;
    const sessionLift =
      Math.max(
        0,
        Math.min(1, (environmentIntensity - 0.72) / 0.28),
      );
    const reefResponseScale =
      0.94 + sessionLift * 0.12;

    for (const target of this.swayTargets) {
      if (target.impact > 0.001) {
        target.impact *= Math.pow(
          0.035,
          deltaSeconds / RESPONSE_DECAY_SECONDS,
        );
      } else {
        target.impact = 0;
      }

      const sway =
        Math.sin(timeSeconds * target.speed + target.phase) *
        target.amplitude *
        (1 + target.impact * (0.64 + sessionLift * 0.2));

      if (
        current != null &&
        current.phase === 'expanding' &&
        current.strength > 0.002 &&
        target.hitPulseId !== current.pulseId
      ) {
        const dx =
          target.root.position.x - current.origin.x;
        const dy =
          target.root.position.y - current.origin.y;
        const dz =
          target.root.position.z - current.origin.z;
        const distance =
          Math.sqrt(dx * dx + dy * dy + dz * dz);
        const shellOffset =
          Math.abs(distance - current.radius);

        if (
          distance > 0.001 &&
          shellOffset < current.shellThickness
        ) {
          const hit =
            (1 - shellOffset / current.shellThickness) *
            current.strength *
            target.responsiveness *
            reefResponseScale *
            (DEBUG_REEF_CURRENT ? 2.4 : 1);
          const forward =
            Math.max(0.28, Math.max(0, -dz / distance));

          target.impact = Math.max(
            target.impact,
            hit,
          );
          target.bendX =
            -forward *
            0.24 *
            target.responsiveness *
            reefResponseScale;
          target.bendZ =
            (-dx / distance) *
            0.16 *
            target.responsiveness *
            reefResponseScale;
          target.hitPulseId = current.pulseId;
        }
      }

      target.root.rotation.z =
        target.baseRotationZ +
        sway +
        target.bendZ * target.impact;
      target.root.rotation.x =
        target.baseRotationX +
        sway * 0.42 +
        target.bendX * target.impact;
    }

    for (const target of this.coralTargets) {
      if (target.impact > 0.001) {
        target.impact *= Math.pow(
          0.035,
          deltaSeconds / RESPONSE_DECAY_SECONDS,
        );
      } else {
        target.impact = 0;
      }

      if (
        current != null &&
        current.phase === 'expanding' &&
        current.strength > 0.002 &&
        target.hitPulseId !== current.pulseId
      ) {
        const dx =
          target.root.position.x - current.origin.x;
        const dy =
          target.root.position.y - current.origin.y;
        const dz =
          target.root.position.z - current.origin.z;
        const distance =
          Math.sqrt(dx * dx + dy * dy + dz * dz);
        const shellOffset =
          Math.abs(distance - current.radius);

        if (
          distance > 0.001 &&
          shellOffset < current.shellThickness
        ) {
          const hit =
            (1 - shellOffset / current.shellThickness) *
            current.strength *
            target.responsiveness *
            reefResponseScale *
            (DEBUG_REEF_CURRENT ? 2.2 : 1);

          target.impact = Math.max(
            target.impact,
            hit,
          );
          target.hitPulseId = current.pulseId;
        }
      }

      const glowMix =
        Math.min(
          DEBUG_REEF_CURRENT
            ? 0.55
            : 0.17 + sessionLift * 0.07,
          target.impact *
            (DEBUG_REEF_CURRENT
              ? 1.2
              : 0.6 + sessionLift * 0.16),
        );
      const emissiveStrength =
        Math.min(
          DEBUG_REEF_CURRENT
            ? 0.22
            : 0.055 + sessionLift * 0.035,
          target.impact *
            (DEBUG_REEF_CURRENT
              ? 0.48
              : 0.18 + sessionLift * 0.07),
        );

      for (
        let materialIndex = 0;
        materialIndex < target.materials.length;
        materialIndex += 1
      ) {
        const material = target.materials[materialIndex];

        material.color
          .copy(target.baseColors[materialIndex])
          .lerp(this.coralGlowColor, glowMix);
        material.emissive
          .copy(target.baseEmissives[materialIndex])
          .lerp(this.coralGlowColor, emissiveStrength);
      }
    }

    this.particles.update(deltaSeconds, timeSeconds);
    this.decorLayer.update(deltaSeconds);

    if (breath != null) {
      this.atmosphere.update(
        deltaSeconds,
        timeSeconds,
        breath,
        current,
      );
      this.marineLife.update(
        deltaSeconds,
        timeSeconds,
        breath,
      );
    }
  }

  resetProgression(): void {
    for (const target of this.swayTargets) {
      target.bendX = 0;
      target.bendZ = 0;
      target.hitPulseId = 0;
      target.impact = 0;
      target.root.rotation.x = target.baseRotationX;
      target.root.rotation.z = target.baseRotationZ;
    }

    for (const target of this.coralTargets) {
      target.hitPulseId = 0;
      target.impact = 0;

      for (
        let materialIndex = 0;
        materialIndex < target.materials.length;
        materialIndex += 1
      ) {
        target.materials[materialIndex].color.copy(
          target.baseColors[materialIndex],
        );
        target.materials[materialIndex].emissive.copy(
          target.baseEmissives[materialIndex],
        );
      }
    }
  }

  dispose(): void {
    this.atmosphere.dispose();
    this.world.scene.background =
      this.previousBackground;
    this.world.scene.fog =
      this.previousFog;
  }

  private addLighting(): void {
    const hemisphere = new HemisphereLight(
      0x78c8d4,
      0x041922,
      1.55,
    );

    hemisphere.name = 'ReefHemisphereLight';

    const ambient = new AmbientLight(
      0x244d58,
      0.42,
    );

    ambient.name = 'ReefSoftAmbientLight';

    const key = new DirectionalLight(
      0xb2f3ff,
      2.25,
    );

    key.name = 'ReefSurfaceKeyLight';
    key.position.set(-2.0, 7.4, -1.25);
    key.target.position.set(0.45, 0.65, -5.7);
    key.castShadow = false;

    const fill = new DirectionalLight(
      0x3f91a4,
      0.32,
    );

    fill.name = 'ReefCoolFillLight';
    fill.position.set(3.8, 2.4, -2.7);
    fill.target.position.set(-0.2, 0.9, -5.4);
    fill.castShadow = false;

    this.root.add(
      hemisphere,
      ambient,
      key,
      key.target,
      fill,
      fill.target,
    );
  }

  private addSeabed(): void {
    const sandTexture = new TextureLoader().load(
      `${import.meta.env.BASE_URL}textures/seabed/textures/sand_03_diff_1k.jpg`,
    );

    sandTexture.colorSpace = SRGBColorSpace;
    sandTexture.wrapS = RepeatWrapping;
    sandTexture.wrapT = RepeatWrapping;
    sandTexture.repeat.set(24, 24);

    const seabedMaterial = new MeshStandardMaterial({
      color: 0xb8aa8f,
      map: sandTexture,
      flatShading: false,
      metalness: 0,
      roughness: 0.96,
    });
    const seabed = new Mesh(
      createSeabedGeometry(),
      seabedMaterial,
    );

    seabed.name = 'ReefSeabed';
    seabed.position.set(0, -0.08, 0);
    seabed.rotation.x = -Math.PI / 2;

    this.root.add(seabed);

    const moundGeometry =
      new DodecahedronGeometry(1, 0);
    const moundMaterial =
      new MeshStandardMaterial({
        color: 0x52695f,
        flatShading: true,
        roughness: 1,
      });
    const mounds = [
      [-4.7, -0.04, -4.8, 2.2, 0.16, 1.0],
      [4.4, -0.05, -5.6, 2.0, 0.14, 1.1],
      [-2.3, -0.06, -7.4, 2.8, 0.18, 0.9],
      [2.6, -0.07, -7.8, 2.5, 0.16, 0.95],
      [0.0, -0.08, -8.4, 3.2, 0.18, 0.7],
    ] as const;

    mounds.forEach((placement, index) => {
      const mound = new Mesh(
        moundGeometry,
        moundMaterial,
      );

      mound.name = `ReefSeabedMound-${index}`;
      mound.position.set(
        placement[0],
        placement[1],
        placement[2],
      );
      mound.scale.set(
        placement[3],
        placement[4],
        placement[5],
      );
      mound.rotation.y = randomRange(0, Math.PI);

      this.root.add(mound);
    });
  }

  private addRocks(): void {
    const geometries = [
      new DodecahedronGeometry(1, 0),
      new IcosahedronGeometry(1, 0),
      new SphereGeometry(1, 7, 5),
    ];

    const materials = [
      new MeshStandardMaterial({
        color: 0x314d4b,
        flatShading: true,
        roughness: 1,
      }),
      new MeshStandardMaterial({
        color: 0x415f54,
        flatShading: true,
        roughness: 1,
      }),
      new MeshStandardMaterial({
        color: 0x293f45,
        flatShading: true,
        roughness: 1,
      }),
    ];

    const placements = [
      [-3.8, 0.16, -2.55, 0.55, 0.24, 0.45],
      [3.6, 0.14, -2.85, 0.5, 0.22, 0.42],
      [-2.8, 0.24, -3.8, 0.82, 0.44, 0.62],
      [2.8, 0.26, -4.1, 0.9, 0.48, 0.7],
      [-2.1, 0.3, -5.2, 1.12, 0.58, 0.84],
      [2.0, 0.32, -5.6, 1.2, 0.62, 0.9],
      [-4.0, 0.35, -6.7, 1.55, 0.82, 1.1],
      [4.1, 0.34, -6.9, 1.48, 0.78, 1.05],
      [-0.8, 0.2, -7.4, 1.35, 0.46, 0.9],
      [0.95, 0.18, -7.7, 1.22, 0.42, 0.82],
    ] as const;

    placements.forEach((placement, index) => {
      const rock = new Mesh(
        geometries[index % geometries.length],
        materials[index % materials.length],
      );

      rock.name = `ReefRock-${index}`;
      rock.position.set(
        placement[0],
        placement[1],
        placement[2],
      );
      rock.scale.set(
        placement[3],
        placement[4],
        placement[5],
      );
      rock.rotation.set(
        randomRange(-0.25, 0.35),
        randomRange(0, Math.PI),
        randomRange(-0.22, 0.22),
      );

      this.root.add(rock);
    });
  }

  private addCoral(): void {
    const branchGeometry =
      new CylinderGeometry(0.018, 0.042, 0.38, 5);
    const tipGeometry =
      new ConeGeometry(0.042, 0.12, 5);
    const moundGeometry =
      new SphereGeometry(0.28, 7, 5);
    const fanGeometry =
      new PlaneGeometry(0.34, 0.42, 1, 2);
    const materials: MeshStandardMaterial[] = [
      new MeshStandardMaterial({
        color: 0x2d807d,
        flatShading: true,
        roughness: 0.92,
      }),
      new MeshStandardMaterial({
        color: 0x66709c,
        flatShading: true,
        roughness: 0.92,
      }),
      new MeshStandardMaterial({
        color: 0x8c6d74,
        flatShading: true,
        roughness: 0.92,
      }),
      new MeshStandardMaterial({
        color: 0x3d676a,
        flatShading: true,
        roughness: 0.95,
      }),
    ];

    const placements = [
      [-2.8, 0.1, -3.4, 0.82],
      [2.7, 0.1, -3.7, 0.78],
      [-1.55, 0.1, -4.9, 0.94],
      [1.65, 0.1, -5.2, 0.9],
      [-3.1, 0.1, -5.9, 1.05],
      [3.2, 0.1, -6.2, 1.0],
      [-0.8, 0.08, -7.0, 0.82],
      [0.95, 0.08, -7.25, 0.76],
    ] as const;

    placements.forEach((placement, clusterIndex) => {
      const coral = new Group();
      const clusterMaterials = materials.map((material) =>
        material.clone(),
      );
      const branchCount =
        3 + (clusterIndex % 3);

      coral.name = `ReefCoral-${clusterIndex}`;
      coral.position.set(
        placement[0],
        placement[1],
        placement[2],
      );
      coral.scale.setScalar(placement[3]);

      const mound = new Mesh(
        moundGeometry,
        clusterMaterials[
          (clusterIndex + 3) % clusterMaterials.length
        ],
      );

      mound.name = `ReefCoralMound-${clusterIndex}`;
      mound.position.y = 0.08;
      mound.scale.set(1, 0.28, 0.76);
      coral.add(mound);

      for (let index = 0; index < branchCount; index += 1) {
        const branchRoot = new Group();
        const angle =
          (index / branchCount) * Math.PI * 2 +
          clusterIndex * 0.35;
        const radius =
          index === 0 ? 0 : randomRange(0.05, 0.13);

        branchRoot.position.set(
          Math.cos(angle) * radius,
          0,
          Math.sin(angle) * radius,
        );
        branchRoot.rotation.z =
          Math.cos(angle) * randomRange(0.2, 0.42);
        branchRoot.rotation.x =
          Math.sin(angle) * randomRange(0.18, 0.36);

        const branch = new Mesh(
          branchGeometry,
          clusterMaterials[
            (clusterIndex + index) % clusterMaterials.length
          ],
        );

        branch.position.y = 0.2;
        branch.scale.y = randomRange(0.75, 1.22);

        const tip = new Mesh(
          tipGeometry,
          clusterMaterials[
            (clusterIndex + index) % clusterMaterials.length
          ],
        );

        tip.position.y = 0.38 * branch.scale.y;

        branchRoot.add(branch, tip);
        coral.add(branchRoot);
      }

      if (clusterIndex % 2 === 1) {
        const fan = new Mesh(
          fanGeometry,
          clusterMaterials[
            (clusterIndex + 1) % clusterMaterials.length
          ],
        );

        fan.name = `ReefFanCoral-${clusterIndex}`;
        fan.position.set(0, 0.3, 0.02);
        fan.rotation.y = randomRange(-0.45, 0.45);
        fan.rotation.z = randomRange(-0.18, 0.18);
        fan.scale.set(
          randomRange(0.75, 1.15),
          randomRange(0.65, 1.0),
          1,
        );

        coral.add(fan);
      }

      this.coralTargets.push({
        baseColors: clusterMaterials.map((material) =>
          material.color.clone(),
        ),
        baseEmissives: clusterMaterials.map((material) =>
          material.emissive.clone(),
        ),
        hitPulseId: 0,
        impact: 0,
        materials: clusterMaterials,
        responsiveness: randomRange(0.82, 1.16),
        root: coral,
      });

      this.root.add(coral);
    });
  }

  private addVegetation(): void {
    const bladeGeometry =
      new PlaneGeometry(0.07, 0.72, 1, 2);
    const tallBladeGeometry =
      new PlaneGeometry(0.085, 1.05, 1, 2);
    const materials = [
      new MeshStandardMaterial({
        color: 0x2f7b71,
        flatShading: true,
        roughness: 0.95,
        side: DoubleSide,
      }),
      new MeshStandardMaterial({
        color: 0x386c5a,
        flatShading: true,
        roughness: 0.95,
        side: DoubleSide,
      }),
    ];

    const placements = [
      [-3.7, -0.03, -2.65],
      [3.6, -0.03, -2.95],
      [-3.9, -0.04, -4.3],
      [3.8, -0.04, -4.6],
      [-2.5, -0.05, -5.5],
      [2.6, -0.05, -5.8],
      [-3.5, -0.05, -7.0],
      [3.4, -0.05, -7.1],
      [-0.75, -0.05, -6.6],
      [0.78, -0.05, -7.55],
    ] as const;

    placements.forEach((placement, index) => {
      const plant = new Group();
      const bladeCount =
        3 + (index % 3);

      plant.name = `ReefSeagrass-${index}`;
      plant.position.set(
        placement[0],
        placement[1],
        placement[2],
      );
      plant.rotation.y = randomRange(0, Math.PI * 2);
      plant.scale.setScalar(randomRange(0.82, 1.18));

      for (let bladeIndex = 0; bladeIndex < bladeCount; bladeIndex += 1) {
        const isTall =
          bladeIndex === 0 &&
          index % 3 === 0;
        const blade = new Mesh(
          isTall
            ? tallBladeGeometry
            : bladeGeometry,
          materials[(index + bladeIndex) % materials.length],
        );

        const angle =
          (bladeIndex / bladeCount) * Math.PI * 2;
        const radius = randomRange(0.035, 0.12);

        blade.position.set(
          Math.cos(angle) * radius,
          isTall ? 0.52 : 0.36,
          Math.sin(angle) * radius,
        );
        blade.rotation.y = angle + Math.PI / 2;
        blade.rotation.z =
          Math.cos(angle) * randomRange(0.12, 0.28);
        blade.rotation.x =
          Math.sin(angle) * randomRange(0.08, 0.2);

        plant.add(blade);
      }

      this.swayTargets.push({
        amplitude: randomRange(0.025, 0.06),
        baseRotationX: plant.rotation.x,
        baseRotationZ: plant.rotation.z,
        bendX: 0,
        bendZ: 0,
        hitPulseId: 0,
        impact: 0,
        phase: Math.random() * Math.PI * 2,
        responsiveness: randomRange(0.78, 1.22),
        root: plant,
        speed: randomRange(0.26, 0.42),
      });

      this.root.add(plant);
    });
  }

  private addLightShafts(): void {
    const geometry = new ConeGeometry(
      0.28,
      5.4,
      8,
      1,
      true,
    );
    const material = new MeshBasicMaterial({
      blending: AdditiveBlending,
      color: 0x9bddea,
      depthWrite: false,
      opacity: 0.022,
      side: DoubleSide,
      transparent: true,
    });

    const placements = [
      [-2.4, 2.25, -4.2, 0.18, -0.24, 0.86],
      [0.1, 2.45, -5.7, -0.1, 0.12, 1.0],
      [2.7, 2.12, -6.8, -0.28, -0.18, 0.74],
    ] as const;

    placements.forEach((placement, index) => {
      const shaft = new Mesh(geometry, material);

      shaft.name = `ReefLightShaft-${index}`;
      shaft.position.set(
        placement[0],
        placement[1],
        placement[2],
      );
      shaft.rotation.set(
        placement[4],
        placement[3],
        0.08,
      );
      shaft.scale.set(
        randomRange(0.72, 1.08),
        placement[5],
        randomRange(0.72, 1.02),
      );

      this.root.add(shaft);
    });
  }
}
