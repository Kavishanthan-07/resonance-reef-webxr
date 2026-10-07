import {
  AnimationClip,
  AnimationMixer,
  Box3,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from '@iwsdk/core';

const TEST_FISH_COUNT = 3;
const BASE_ANIMATION_SPEED = 0.8;
const BODY_COLOR = new Color(0x587d82);
const FIN_DETAIL_COLOR = new Color(0x31565f);
const BASS_ROUGHNESS = 0.78;
const BASS_METALNESS = 0;
const BASS_EMISSIVE = 0x000000;
const PLACEMENTS = [
  {
    label: 'left-of-jellyfish',
    position: new Vector3(-1.45, 2.06, -4.3),
  },
  {
    label: 'right-of-jellyfish',
    position: new Vector3(1.45, 2.04, -4.35),
  },
  {
    label: 'higher-back',
    position: new Vector3(0.75, 2.36, -5.25),
  },
] as const;

export const bassScale = {
  max: 0.6,
  min: 0.001,
  targetLengthMeters: 0.42,
} as const;

export const headingOffsetY = 0;

interface BassFishInstance {
  mixer: AnimationMixer | null;
  root: Group;
}

export interface BassFishTestReport {
  animationNames: string[];
  bassObjectNames: string[];
  bodyColor: string;
  detailColor: string;
  emissive: number;
  emissiveIntensity: number;
  headingOffsetY: number;
  materialAudits: BassMaterialAudit[];
  materialCount: number;
  materialTreatmentApplied: boolean;
  metalness: number;
  meshCount: number;
  originalTextureMapsPresent: boolean;
  roughness: number;
  scale: number;
  selectedAnimationName: string | null;
  separateFinMaterialFound: boolean;
  skinnedMeshCount: number;
  speedRange: readonly [number, number];
}

export interface BassMaterialAudit {
  cloned: boolean;
  clonedUuid: string | null;
  finalName: string;
  finalType: string;
  finalUuid: string | null;
  hasMap: boolean;
  name: string;
  sourceUuid: string | null;
  type: string;
}

interface MaterialLike {
  clone?: () => unknown;
  map?: unknown;
  name?: string;
  type?: string;
  uuid?: string;
}

function selectBassFishAnimation(
  clips: readonly AnimationClip[],
): AnimationClip | null {
  const preferred = clips.find(
    (candidate) =>
      candidate.name === 'Armature|ArmatureAction',
  );

  if (preferred != null) {
    return preferred;
  }

  if (clips.length === 0) {
    return null;
  }

  const priorities = ['swim', 'swimming', 'idle'];

  for (const priority of priorities) {
    const clip = clips.find((candidate) =>
      candidate.name
        .toLowerCase()
        .includes(priority),
    );

    if (clip != null) {
      return clip;
    }
  }

  return clips[0];
}

function gatherMaterials(visual: Object3D): Set<unknown> {
  const materials = new Set<unknown>();

  visual.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    const mesh = child as Mesh & {
      material: unknown | unknown[];
    };
    const childMaterials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];

    childMaterials.forEach((material) => {
      materials.add(material);
    });
  });

  return materials;
}

function countMeshes(visual: Object3D): {
  meshCount: number;
  skinnedMeshCount: number;
} {
  let meshCount = 0;
  let skinnedMeshCount = 0;

  visual.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    meshCount += 1;

    if (child.type === 'SkinnedMesh') {
      skinnedMeshCount += 1;
    }
  });

  return { meshCount, skinnedMeshCount };
}

function calculateScale(visual: Object3D): number {
  const box = new Box3().setFromObject(visual);
  const size = new Vector3();

  box.getSize(size);

  const longestSide = Math.max(size.x, size.y, size.z);

  if (!Number.isFinite(longestSide) || longestSide <= 0.0001) {
    return 0.1;
  }

  return Math.max(
    bassScale.min,
    Math.min(
      bassScale.max,
      bassScale.targetLengthMeters / longestSide,
    ),
  );
}

function isFinOrDetailMaterial(
  material: unknown,
  materialIndex: number,
): boolean {
  const name = ((material as MaterialLike).name ?? '')
    .toLowerCase();

  return (
    name.includes('fin') ||
    name.includes('tail') ||
    name.includes('detail') ||
    name.includes('eye') ||
    materialIndex > 0
  );
}

function colorToHexString(color: Color): string {
  return `#${color.getHexString()}`;
}

function createBassFallbackMaterial(
  source: unknown,
  materialIndex: number,
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: isFinOrDetailMaterial(source, materialIndex)
      ? FIN_DETAIL_COLOR
      : BODY_COLOR,
    emissive: BASS_EMISSIVE,
    emissiveIntensity: 0,
    metalness: BASS_METALNESS,
    roughness: BASS_ROUGHNESS,
    transparent: false,
  });

  material.name = isFinOrDetailMaterial(source, materialIndex)
    ? `BassFishTestFinMaterial-${materialIndex}`
    : `BassFishTestBodyMaterial-${materialIndex}`;
  material.needsUpdate = true;

  return material;
}

function cloneMaterialForBass(
  material: unknown,
): {
  cloned: boolean;
  material: unknown;
} {
  const cloneable = material as MaterialLike;

  if (typeof cloneable.clone !== 'function') {
    return {
      cloned: false,
      material,
    };
  }

  return {
    cloned: true,
    material: cloneable.clone(),
  };
}

function applyIsolatedBassMaterials(
  visual: Object3D,
): {
  materialAudits: BassMaterialAudit[];
  materialTreatmentApplied: boolean;
  separateFinMaterialFound: boolean;
} {
  const materialCache = new Map<
    unknown,
    {
      audit: BassMaterialAudit;
      material: MeshStandardMaterial;
    }
  >();
  const materialAudits: BassMaterialAudit[] = [];
  let separateFinMaterialFound = false;

  visual.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    const mesh = child as Mesh & {
      material: unknown | unknown[];
    };
    const sourceMaterials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const treatedMaterials = sourceMaterials.map(
      (material, materialIndex) => {
        const cached = materialCache.get(material);

        if (cached != null) {
          return cached.material;
        }

        const source = material as MaterialLike;
        const isolated = cloneMaterialForBass(material);
        const isolatedMaterial =
          isolated.material as MaterialLike;
        const dedicatedMaterial =
          createBassFallbackMaterial(
            isolatedMaterial,
            materialIndex,
          );
        const finalMaterial =
          dedicatedMaterial as MaterialLike;

        if (isFinOrDetailMaterial(material, materialIndex)) {
          separateFinMaterialFound = true;
        }

        const audit = {
          cloned: isolated.cloned,
          clonedUuid: isolatedMaterial.uuid ?? null,
          finalName: finalMaterial.name ?? '(unnamed)',
          finalType:
            finalMaterial.type ??
            dedicatedMaterial.constructor.name,
          finalUuid: finalMaterial.uuid ?? null,
          hasMap: source.map != null,
          name: source.name ?? '(unnamed)',
          sourceUuid: source.uuid ?? null,
          type:
            source.type ??
            (material as object).constructor.name,
        };

        materialAudits.push(audit);
        materialCache.set(material, {
          audit,
          material: dedicatedMaterial,
        });
        return dedicatedMaterial;
      },
    );

    mesh.material = Array.isArray(mesh.material)
      ? treatedMaterials
      : treatedMaterials[0];
  });

  return {
    materialAudits,
    materialTreatmentApplied: materialCache.size > 0,
    separateFinMaterialFound,
  };
}

export class BassFishTest {
  readonly root = new Group();
  readonly report: BassFishTestReport;

  private readonly instances: BassFishInstance[] = [];

  constructor(
    visualFactory: () => Object3D,
    animations: readonly AnimationClip[],
  ) {
    this.root.name = 'ResonanceReefBassFishTest';

    const selectedAnimation =
      selectBassFishAnimation(animations);
    const probe = visualFactory();
    const scale = calculateScale(probe);
    const materials = gatherMaterials(probe);
    const originalTextureMapsPresent = [...materials].some(
      (material) => (material as MaterialLike).map != null,
    );
    const materialReport =
      applyIsolatedBassMaterials(probe);

    const { meshCount, skinnedMeshCount } =
      countMeshes(probe);

    this.report = {
      animationNames: animations.map((clip) => clip.name),
      bassObjectNames: PLACEMENTS.map(
        (placement, index) =>
          `BassFishTest-${placement.label}-${index}`,
      ),
      bodyColor: colorToHexString(BODY_COLOR),
      detailColor: colorToHexString(FIN_DETAIL_COLOR),
      emissive: BASS_EMISSIVE,
      emissiveIntensity: 0,
      headingOffsetY,
      materialAudits: materialReport.materialAudits,
      materialCount: materials.size,
      materialTreatmentApplied:
        materialReport.materialTreatmentApplied,
      metalness: BASS_METALNESS,
      meshCount,
      originalTextureMapsPresent,
      roughness: BASS_ROUGHNESS,
      scale,
      selectedAnimationName: selectedAnimation?.name ?? null,
      separateFinMaterialFound:
        materialReport.separateFinMaterialFound,
      skinnedMeshCount,
      speedRange: [0.76, 0.84],
    };

    this.createInstances(
      probe,
      visualFactory,
      selectedAnimation,
      scale,
    );
  }

  update(deltaSeconds: number, timeSeconds: number): void {
    for (let index = 0; index < this.instances.length; index += 1) {
      const instance = this.instances[index];
      const home = PLACEMENTS[index].position;
      const phase =
        timeSeconds * (0.1 + index * 0.015) +
        index * 2.08;
      const radiusX = 0.18 + index * 0.03;
      const radiusZ = 0.14 + index * 0.025;
      const x = home.x + Math.cos(phase) * radiusX;
      const y =
        home.y +
        Math.sin(timeSeconds * 0.17 + index) * 0.08;
      const z = home.z + Math.sin(phase) * radiusZ;
      const nextPhase = phase + 0.04;
      const next = new Vector3(
        home.x + Math.cos(nextPhase) * radiusX,
        y,
        home.z + Math.sin(nextPhase) * radiusZ,
      );

      instance.root.position.set(x, y, z);
      instance.root.lookAt(next);
      instance.root.rotation.y += headingOffsetY;
      instance.mixer?.update(deltaSeconds);
    }
  }

  dispose(): void {
    this.root.clear();
    this.instances.length = 0;
  }

  private createInstances(
    probe: Object3D,
    visualFactory: () => Object3D,
    selectedAnimation: AnimationClip | null,
    scale: number,
  ): void {
    for (let index = 0; index < TEST_FISH_COUNT; index += 1) {
      const root = new Group();
      const visual = index === 0 ? probe : visualFactory();
      const placement = PLACEMENTS[index];

      if (index > 0) {
        applyIsolatedBassMaterials(visual);
      }

      visual.scale.setScalar(scale);
      root.name = `BassFishTest-${placement.label}-${index}`;
      root.position.set(
        placement.position.x,
        placement.position.y,
        placement.position.z,
      );
      root.add(visual);

      const mixer =
        selectedAnimation == null
          ? null
          : new AnimationMixer(visual);

      const speed =
        BASE_ANIMATION_SPEED - 0.04 + index * 0.04;

      if (mixer != null && selectedAnimation != null) {
        const action = mixer.clipAction(selectedAnimation);

        action.timeScale = speed;
        action.play();
      }

      this.instances.push({
        mixer,
        root,
      });
      this.root.add(root);
    }
  }
}
