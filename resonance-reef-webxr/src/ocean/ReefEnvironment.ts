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
  SphereGeometry,
  type Material,
  type Scene,
  type Texture,
  type World,
} from '@iwsdk/core';

import { UnderwaterParticles } from './UnderwaterParticles.js';

interface SwayTarget {
  root: Group;
  phase: number;
  amplitude: number;
  speed: number;
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function createSeabedGeometry(): PlaneGeometry {
  const geometry = new PlaneGeometry(12, 10, 10, 8);
  const position =
    geometry.getAttribute('position');

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const height =
      Math.sin(x * 0.7 + y * 0.22) * 0.035 +
      Math.cos(y * 0.55) * 0.025;

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

  readonly rockCount = 8;
  readonly vegetationCount = 18;
  readonly coralClusterCount = 5;
  readonly lightShaftCount = 3;
  readonly particleCount = 180;
  readonly approximateMeshCount = 92;

  private readonly previousBackground:
    | Color
    | Texture
    | null;
  private readonly previousFog: Scene['fog'];
  private readonly swayTargets: SwayTarget[] = [];
  private readonly particles: UnderwaterParticles;

  constructor(private readonly world: World) {
    this.root.name = 'ResonanceReefEnvironment';

    this.previousBackground =
      world.scene.background;
    this.previousFog =
      world.scene.fog;

    world.scene.background =
      new Color(0x062532);
    world.scene.fog =
      new Fog(0x0a4a58, 3.2, 11.5);

    this.addLighting();
    this.addSeabed();
    this.addRocks();
    this.addCoral();
    this.addVegetation();
    this.addLightShafts();

    this.particles =
      new UnderwaterParticles({
        count: this.particleCount,
        xRange: [-4.6, 4.6],
        yRange: [0.45, 2.9],
        zRange: [-7.8, -1.2],
      });

    this.root.add(this.particles.points);
    setNoShadows(this.root);
  }

  update(deltaSeconds: number, timeSeconds: number): void {
    for (const target of this.swayTargets) {
      const sway =
        Math.sin(timeSeconds * target.speed + target.phase) *
        target.amplitude;

      target.root.rotation.z = sway;
      target.root.rotation.x = sway * 0.42;
    }

    this.particles.update(deltaSeconds, timeSeconds);
  }

  dispose(): void {
    this.world.scene.background =
      this.previousBackground;
    this.world.scene.fog =
      this.previousFog;
  }

  private addLighting(): void {
    const hemisphere = new HemisphereLight(
      0x8bd5e4,
      0x06232b,
      2.25,
    );

    hemisphere.name = 'ReefHemisphereLight';

    const ambient = new AmbientLight(
      0x315b65,
      0.9,
    );

    ambient.name = 'ReefSoftAmbientLight';

    const key = new DirectionalLight(
      0xb9f4ff,
      2.2,
    );

    key.name = 'ReefSurfaceKeyLight';
    key.position.set(-2.6, 5.2, 1.4);
    key.target.position.set(0, 1.1, -4.0);
    key.castShadow = false;

    const fill = new DirectionalLight(
      0x5db7c9,
      0.55,
    );

    fill.name = 'ReefCoolFillLight';
    fill.position.set(3.2, 2.6, -3.6);
    fill.target.position.set(0, 1.0, -4.8);
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
    const seabed = new Mesh(
      createSeabedGeometry(),
      new MeshStandardMaterial({
        color: 0x486c66,
        flatShading: true,
        metalness: 0,
        roughness: 1,
      }),
    );

    seabed.name = 'ReefSeabed';
    seabed.position.set(0, -0.08, -4.2);
    seabed.rotation.x = -Math.PI / 2;

    this.root.add(seabed);
  }

  private addRocks(): void {
    const geometries = [
      new DodecahedronGeometry(1, 0),
      new IcosahedronGeometry(1, 0),
      new SphereGeometry(1, 7, 5),
    ];

    const materials = [
      new MeshStandardMaterial({
        color: 0x294d50,
        flatShading: true,
        roughness: 1,
      }),
      new MeshStandardMaterial({
        color: 0x375d56,
        flatShading: true,
        roughness: 1,
      }),
      new MeshStandardMaterial({
        color: 0x233e48,
        flatShading: true,
        roughness: 1,
      }),
    ];

    const placements = [
      [-3.6, 0.2, -2.8, 0.8, 0.42, 0.65],
      [3.3, 0.18, -3.0, 0.72, 0.38, 0.58],
      [-2.4, 0.28, -4.4, 1.05, 0.62, 0.78],
      [2.2, 0.32, -4.9, 1.16, 0.7, 0.86],
      [-3.8, 0.34, -6.1, 1.35, 0.84, 1.02],
      [3.6, 0.32, -6.4, 1.28, 0.78, 1.0],
      [-0.8, 0.2, -6.8, 1.0, 0.46, 0.84],
      [0.9, 0.16, -2.75, 0.55, 0.28, 0.42],
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
      new CylinderGeometry(0.025, 0.055, 0.75, 5);
    const tipGeometry =
      new ConeGeometry(0.055, 0.18, 5);
    const materials: Material[] = [
      new MeshStandardMaterial({
        color: 0x2d807d,
        flatShading: true,
        roughness: 0.92,
      }),
      new MeshStandardMaterial({
        color: 0x596493,
        flatShading: true,
        roughness: 0.92,
      }),
      new MeshStandardMaterial({
        color: 0x8b686e,
        flatShading: true,
        roughness: 0.92,
      }),
    ];

    const placements = [
      [-2.7, 0.18, -3.6, 0.9],
      [2.9, 0.18, -3.8, 0.82],
      [-1.8, 0.16, -5.6, 1.05],
      [1.9, 0.18, -6.0, 1.0],
      [0.0, 0.14, -6.7, 0.74],
    ] as const;

    placements.forEach((placement, clusterIndex) => {
      const coral = new Group();
      const branchCount =
        clusterIndex === 4 ? 3 : 4;

      coral.name = `ReefCoral-${clusterIndex}`;
      coral.position.set(
        placement[0],
        placement[1],
        placement[2],
      );
      coral.scale.setScalar(placement[3]);

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
          Math.cos(angle) * randomRange(0.16, 0.34);
        branchRoot.rotation.x =
          Math.sin(angle) * randomRange(0.12, 0.28);

        const branch = new Mesh(
          branchGeometry,
          materials[(clusterIndex + index) % materials.length],
        );

        branch.position.y = 0.35;
        branch.scale.y = randomRange(0.7, 1.12);

        const tip = new Mesh(
          tipGeometry,
          materials[(clusterIndex + index) % materials.length],
        );

        tip.position.y = 0.74 * branch.scale.y;

        branchRoot.add(branch, tip);
        coral.add(branchRoot);
      }

      this.root.add(coral);
    });
  }

  private addVegetation(): void {
    const bladeGeometry =
      new CylinderGeometry(0.012, 0.026, 0.68, 5, 1);
    const tallBladeGeometry =
      new CylinderGeometry(0.015, 0.032, 1.05, 5, 1);
    const materials = [
      new MeshStandardMaterial({
        color: 0x2f7b71,
        flatShading: true,
        roughness: 0.95,
      }),
      new MeshStandardMaterial({
        color: 0x386c5a,
        flatShading: true,
        roughness: 0.95,
      }),
    ];

    const placements = [
      [-3.8, -0.02, -2.3],
      [-2.9, -0.03, -2.7],
      [2.6, -0.03, -2.5],
      [3.8, -0.02, -2.9],
      [-4.1, -0.04, -3.9],
      [4.0, -0.04, -4.2],
      [-2.8, -0.05, -5.2],
      [2.7, -0.05, -5.4],
      [-1.2, -0.06, -6.4],
      [1.4, -0.06, -6.7],
      [-3.6, -0.04, -6.9],
      [3.5, -0.04, -6.8],
      [-0.65, -0.04, -2.9],
      [0.72, -0.04, -3.1],
      [-1.9, -0.05, -4.5],
      [1.9, -0.05, -4.7],
      [-0.15, -0.05, -5.6],
      [0.35, -0.05, -7.2],
    ] as const;

    placements.forEach((placement, index) => {
      const plant = new Group();
      const bladeCount =
        index % 3 === 0 ? 3 : 2;

      plant.name = `ReefSeagrass-${index}`;
      plant.position.set(
        placement[0],
        placement[1],
        placement[2],
      );
      plant.rotation.y = randomRange(0, Math.PI * 2);
      plant.scale.setScalar(randomRange(0.82, 1.18));

      for (let bladeIndex = 0; bladeIndex < bladeCount; bladeIndex += 1) {
        const blade = new Mesh(
          bladeIndex === 0 &&
            index % 4 === 0
            ? tallBladeGeometry
            : bladeGeometry,
          materials[(index + bladeIndex) % materials.length],
        );

        const angle =
          (bladeIndex / bladeCount) * Math.PI * 2;
        const radius =
          bladeCount === 2 ? 0.035 : 0.055;

        blade.position.set(
          Math.cos(angle) * radius,
          blade.geometry === tallBladeGeometry ? 0.52 : 0.34,
          Math.sin(angle) * radius,
        );
        blade.rotation.z =
          Math.cos(angle) * randomRange(0.08, 0.18);
        blade.rotation.x =
          Math.sin(angle) * randomRange(0.08, 0.18);

        plant.add(blade);
      }

      this.swayTargets.push({
        amplitude: randomRange(0.025, 0.06),
        phase: Math.random() * Math.PI * 2,
        root: plant,
        speed: randomRange(0.26, 0.42),
      });

      this.root.add(plant);
    });
  }

  private addLightShafts(): void {
    const geometry = new PlaneGeometry(0.7, 5.2);
    const material = new MeshBasicMaterial({
      blending: AdditiveBlending,
      color: 0x9bddea,
      depthWrite: false,
      opacity: 0.065,
      side: DoubleSide,
      transparent: true,
    });

    const placements = [
      [-2.3, 2.1, -4.2, 0.25],
      [0.4, 2.3, -5.8, -0.12],
      [2.7, 2.0, -6.6, -0.32],
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
        -0.2,
        placement[3],
        0.12,
      );

      this.root.add(shaft);
    });
  }
}
