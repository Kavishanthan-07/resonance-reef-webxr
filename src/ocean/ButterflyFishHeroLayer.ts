import {
  AnimationMixer,
  Color,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Vector3,
  type AnimationClip,
  type Material,
} from '@iwsdk/core';

import type { BreathState } from '../breathing/BreathEngine.js';

export const HERO_BUTTERFLY_FISH_COUNT = 4;
export const BUTTERFLY_FISH_SCALE = 0.22;
export const BUTTERFLY_FISH_HEADING_OFFSET_Y = Math.PI;
export const BUTTERFLY_FISH_INHALE_RADIUS_DELTA = 0.11;
export const BUTTERFLY_FISH_EXHALE_RADIUS_DELTA = 0.14;

interface ButterflyFishHeroLayerConfig {
  animations: readonly AnimationClip[];
  fishCount?: number;
  headingOffsetY?: number;
  materialStyle?: ButterflyFishMaterialStyle;
  modelScale?: number;
  visualFactory: () => Object3D;
}

export type ButterflyFishMaterialStyle =
  | 'legacy-muted'
  | 'natural-hero';

interface ButterflyPathConfig {
  breathResponse: number;
  center: Vector3;
  phase: number;
  radiusX: number;
  radiusZ: number;
  speed: number;
  verticalAmplitude: number;
  verticalPhase: number;
}

interface BreathTintTarget {
  accentStrength: number;
  brightnessStrength: number;
  material: MeshBasicMaterial | MeshStandardMaterial;
  restingColor: Color;
}

const BREATH_ACCENT_COLORS = [
  0xd8ba79,
  0xa1cabc,
  0xe1c68d,
  0x95b9ad,
] as const;

interface ButterflyFishInstance {
  breathTintTargets: BreathTintTarget[];
  breathAccentColor: Color;
  tintScratch: Color;
  group: Group;
  guideBias: Vector3;
  lookTarget: Vector3;
  mixer: AnimationMixer | null;
  path: ButterflyPathConfig;
  previousPosition: Vector3;
  smoothedBreathScale: number;
  headingOffsetY: number;
  smoothedHeading: Vector3;
}

interface TextureLike {
  image?: {
    height?: number;
    width?: number;
  };
  name?: string;
}

interface MaterialLike {
  map?: TextureLike | null;
  name?: string;
  normalMap?: TextureLike | null;
  type?: string;
}

export interface ButterflyFishMaterialAudit {
  hasMap: boolean;
  hasNormalMap: boolean;
  mapName: string | null;
  mapSize: string | null;
  materialName: string;
  materialType: string;
  normalMapName: string | null;
  normalMapSize: string | null;
}

export interface ButterflyFishHeroLayerReport {
  animationNames: string[];
  breathResponseRange: [number, number];
  closestDistanceMeters: number;
  fallbackMaterialCorrectionUsed: boolean;
  fishCount: number;
  materialAudits: ButterflyFishMaterialAudit[];
  selectedAnimationName: string | null;
}

const USER_POINT = new Vector3(0, 1.6, 0);
const GUIDE_POINT = new Vector3(0, 1.68, -2.3);

const HERO_PATHS: readonly ButterflyPathConfig[] = [
  {
    breathResponse: 0.82,
    center: new Vector3(-1.75, 1.5, -3.78),
    phase: 0.4,
    radiusX: 0.36,
    radiusZ: 0.26,
    speed: 0.115,
    verticalAmplitude: 0.055,
    verticalPhase: 1.2,
  },
  {
    breathResponse: 0.96,
    center: new Vector3(1.75, 1.64, -4.18),
    phase: 2.3,
    radiusX: 0.38,
    radiusZ: 0.3,
    speed: 0.102,
    verticalAmplitude: 0.07,
    verticalPhase: 2.7,
  },
  {
    breathResponse: 1.08,
    center: new Vector3(0.9, 2.08, -4.92),
    phase: 4.1,
    radiusX: 0.32,
    radiusZ: 0.28,
    speed: 0.092,
    verticalAmplitude: 0.06,
    verticalPhase: 0.1,
  },
  {
    breathResponse: 1.18,
    center: new Vector3(-1.25, 1.78, -5.55),
    phase: 5.6,
    radiusX: 0.72,
    radiusZ: 0.5,
    speed: 0.078,
    verticalAmplitude: 0.085,
    verticalPhase: 4.4,
  },
] as const;

const BODY_COLOR =
  new Color(0xbba76c).lerp(
    new Color(0x4f8588),
    0.15,
  );
const ACCENT_COLOR =
  new Color(0xaa9144).lerp(
    new Color(0x4f8588),
    0.12,
  );
const MARKING_COLOR = new Color(0x2b3f48);

function textureSize(texture: TextureLike | null | undefined): string | null {
  const width = texture?.image?.width;
  const height = texture?.image?.height;

  if (width == null || height == null) {
    return null;
  }

  return `${width}x${height}`;
}

function isPlaceholderTexture(
  texture: TextureLike | null | undefined,
): boolean {
  const width = texture?.image?.width ?? 0;
  const height = texture?.image?.height ?? 0;

  return width <= 2 || height <= 2;
}

function isUsableAnimationClip(
  clip: AnimationClip,
): boolean {
  return clip.duration > 0 && clip.tracks.length > 0;
}

function selectUsableAnimationClip(
  clips: readonly AnimationClip[],
): AnimationClip | null {
  const usableClips = clips.filter(isUsableAnimationClip);

  if (usableClips.length === 0) {
    return null;
  }

  const priorities = [
    'swimming_normal',
    'swim_normal',
    'normal',
    'swim',
    'swimming',
    'idle',
  ];

  for (const priority of priorities) {
    const clip = usableClips.find((candidate) =>
      candidate.name
        .toLowerCase()
        .includes(priority),
    );

    if (clip != null) {
      return clip;
    }
  }

  return usableClips[0];
}

function materialAudit(
  material: Material,
): ButterflyFishMaterialAudit {
  const readable = material as MaterialLike;

  return {
    hasMap: readable.map != null,
    hasNormalMap: readable.normalMap != null,
    mapName: readable.map?.name ?? null,
    mapSize: textureSize(readable.map),
    materialName: readable.name ?? '(unnamed)',
    materialType: readable.type ?? material.constructor.name,
    normalMapName: readable.normalMap?.name ?? null,
    normalMapSize: textureSize(readable.normalMap),
  };
}

function materialNeedsFallback(
  material: Material,
): boolean {
  const readable = material as MaterialLike;
  const name = readable.name?.toLowerCase() ?? '';

  if (!name.includes('body')) {
    return false;
  }

  return (
    readable.map == null ||
    isPlaceholderTexture(readable.map) ||
    isPlaceholderTexture(readable.normalMap)
  );
}

function tuneBodyMaterial(
  material: Material,
): void {
  if (material instanceof MeshStandardMaterial) {
    material.color.copy(BODY_COLOR).lerp(
      ACCENT_COLOR,
      0.22,
    );
    material.color.multiplyScalar(0.66);
    material.map = null;
    material.normalMap = null;
    material.emissive.set(0x000000);
    material.emissiveIntensity = 0;
    material.metalness = 0;
    material.roughness = Math.max(material.roughness, 0.88);
    material.transparent = false;
    material.opacity = 1;
    material.needsUpdate = true;
    return;
  }

  if (material instanceof MeshBasicMaterial) {
    material.color.copy(BODY_COLOR).lerp(
      ACCENT_COLOR,
      0.22,
    );
    material.color.multiplyScalar(0.66);
    material.map = null;
    material.fog = true;
    material.transparent = false;
    material.opacity = 1;
    material.needsUpdate = true;
  }
}

function tuneMarkingMaterial(
  material: Material,
): void {
  const readable = material as MaterialLike;
  const name = readable.name?.toLowerCase() ?? '';

  if (!name.includes('eye')) {
    return;
  }

  if (material instanceof MeshStandardMaterial) {
    material.color.copy(MARKING_COLOR);
    material.emissive.set(0x000000);
    material.emissiveIntensity = 0;
    material.metalness = 0;
    material.roughness = Math.max(material.roughness, 0.78);
    material.needsUpdate = true;
  } else if (material instanceof MeshBasicMaterial) {
    material.color.copy(MARKING_COLOR);
    material.fog = true;
    material.needsUpdate = true;
  }
}

function tuneNaturalHeroMaterial(
  material: Material,
): BreathTintTarget | null {
  const readable = material as MaterialLike;
  const name = readable.name?.toLowerCase() ?? '';
  const isEye = name.includes('eye');
  const isDark =
    name.includes('dark') ||
    name.includes('black');
  const isLight =
    name.includes('light') ||
    name.includes('white');
  const isMain = name.includes('main');

  if (material instanceof MeshStandardMaterial) {
    if (isEye) {
      material.color.set(0x050604);
      material.emissive.set(0x000000);
      material.emissiveIntensity = 0;
      material.metalness = 0;
      material.roughness = Math.max(material.roughness, 0.38);
      material.needsUpdate = true;

      return null;
    }

    if (isDark) {
      material.color.set(0x11120d);
    } else if (isLight) {
      material.color.lerp(new Color(0xd8cfaa), 0.5);
    } else if (isMain) {
      material.color.lerp(new Color(0xc8b36a), 0.62);
    } else {
      material.color.multiplyScalar(1.08);
    }

    material.emissive.set(0x000000);
    material.emissiveIntensity = 0;
    material.metalness = 0;
    material.roughness = Math.max(
      material.roughness,
      isDark ? 0.82 : 0.74,
    );
    material.transparent = false;
    material.opacity = 1;
    material.needsUpdate = true;

    return {
      accentStrength: isDark ? 0.08 : isMain ? 0.24 : 0.18,
      brightnessStrength: isDark ? 0.04 : 0.12,
      material,
      restingColor: material.color.clone(),
    };
  }

  if (material instanceof MeshBasicMaterial) {
    if (isEye) {
      material.color.set(0x050604);
      material.fog = true;
      material.needsUpdate = true;

      return null;
    }

    if (isDark) {
      material.color.set(0x11120d);
    } else if (isMain) {
      material.color.lerp(new Color(0xc8b36a), 0.62);
    } else {
      material.color.multiplyScalar(1.08);
    }

    material.fog = true;
    material.transparent = false;
    material.opacity = 1;
    material.needsUpdate = true;

    return {
      accentStrength: isDark ? 0.08 : isMain ? 0.24 : 0.18,
      brightnessStrength: isDark ? 0.04 : 0.12,
      material,
      restingColor: material.color.clone(),
    };
  }

  return null;
}

function cloneAndTuneMaterials(
  visual: Object3D,
  style: ButterflyFishMaterialStyle,
): {
  audits: ButterflyFishMaterialAudit[];
  fallbackUsed: boolean;
  tintTargets: BreathTintTarget[];
} {
  const audits: ButterflyFishMaterialAudit[] = [];
  const tintTargets: BreathTintTarget[] = [];
  let fallbackUsed = false;

  visual.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    child.castShadow = false;
    child.receiveShadow = false;

    const sourceMaterials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    const clonedMaterials = sourceMaterials.map(
      (material) => material.clone(),
    );

    for (const material of clonedMaterials) {
      audits.push(materialAudit(material));

      if (style === 'natural-hero') {
        const tintTarget =
          tuneNaturalHeroMaterial(material);

        if (tintTarget != null) {
          tintTargets.push(tintTarget);
        }
      } else {
        if (materialNeedsFallback(material)) {
          fallbackUsed = true;
        }

        tuneBodyMaterial(material);
        tuneMarkingMaterial(material);
        // Record unique cloned body materials, but leave eyes dark.
        if (!material.name.toLowerCase().includes('eye') &&
            (material instanceof MeshBasicMaterial ||
             material instanceof MeshStandardMaterial)) {
          tintTargets.push({
            accentStrength: 0.55,
            brightnessStrength: 0,
            material,
            restingColor: material.color.clone(),
          });
        }
      }
    }

    child.material = Array.isArray(child.material)
      ? clonedMaterials
      : clonedMaterials[0];
  });

  return {
    audits,
    fallbackUsed,
    tintTargets,
  };
}

function breathRadiusScale(
  state: BreathState,
  response: number,
): number {
  const eased =
    MathUtils.smoothstep(state.progress, 0, 1);
  const delta =
    state.phase === 'inhale'
      ? -BUTTERFLY_FISH_INHALE_RADIUS_DELTA
      : BUTTERFLY_FISH_EXHALE_RADIUS_DELTA;

  return 1 + delta * response * eased;
}

function distanceFromUser(point: Vector3): number {
  return point.distanceTo(USER_POINT);
}

function estimateClosestDistance(): number {
  let closest = Number.POSITIVE_INFINITY;

  for (const path of HERO_PATHS) {
    const nearPoint = new Vector3(
      path.center.x,
      path.center.y - path.verticalAmplitude,
      path.center.z + path.radiusZ,
    );
    const distance =
      distanceFromUser(nearPoint) - path.radiusX;

    closest = Math.min(closest, distance);
  }

  return closest;
}

export class ButterflyFishHeroLayer {
  readonly root = new Group();
  readonly report: ButterflyFishHeroLayerReport;

  private readonly instances: ButterflyFishInstance[] = [];
  private readonly selectedAnimation: AnimationClip | null;

  constructor(config: ButterflyFishHeroLayerConfig) {
    this.root.name = 'ResonanceReefButterflyFishHeroLayer';

    this.selectedAnimation =
      selectUsableAnimationClip(config.animations);
    const fishCount =
      config.fishCount ?? HERO_BUTTERFLY_FISH_COUNT;
    const modelScale =
      config.modelScale ?? BUTTERFLY_FISH_SCALE;
    const headingOffsetY =
      config.headingOffsetY ?? BUTTERFLY_FISH_HEADING_OFFSET_Y;
    const materialStyle =
      config.materialStyle ?? 'legacy-muted';

    let fallbackMaterialCorrectionUsed = false;
    const materialAudits: ButterflyFishMaterialAudit[] = [];

    for (
      let index = 0;
      index < fishCount;
      index += 1
    ) {
      const path = HERO_PATHS[index % HERO_PATHS.length];
      const group = new Group();
      const visual = config.visualFactory();
      const materialResult =
        cloneAndTuneMaterials(visual, materialStyle);
      const mixer =
        this.selectedAnimation == null
          ? null
          : new AnimationMixer(visual);

      group.name = `ButterflyFishHero-${index}`;
      group.position.copy(path.center);
      visual.scale.setScalar(modelScale);
      group.add(visual);

      if (mixer != null && this.selectedAnimation != null) {
        const action =
          mixer.clipAction(this.selectedAnimation);

        action.timeScale = 0.68 + index * 0.06;
        action.play();
      }

      fallbackMaterialCorrectionUsed =
        fallbackMaterialCorrectionUsed ||
        materialResult.fallbackUsed;
      materialAudits.push(...materialResult.audits);

      this.instances.push({
        breathTintTargets: materialResult.tintTargets,
        breathAccentColor: new Color(
          BREATH_ACCENT_COLORS[index % BREATH_ACCENT_COLORS.length] ?? 0xa1cabc,
        ),
        tintScratch: new Color(),
        group,
        guideBias: new Vector3(),
        lookTarget: new Vector3(),
        mixer,
        path,
        previousPosition: path.center.clone(),
        smoothedBreathScale: 1,
        headingOffsetY,
        smoothedHeading: new Vector3(0, 0, -1),
      });
      this.root.add(group);
    }

    this.report = {
      animationNames: config.animations.map(
        (clip) =>
          `${clip.name || '(unnamed)'}:${clip.tracks.length} tracks`,
      ),
      breathResponseRange: [
        BUTTERFLY_FISH_INHALE_RADIUS_DELTA * HERO_PATHS[0].breathResponse,
        BUTTERFLY_FISH_EXHALE_RADIUS_DELTA *
          HERO_PATHS[HERO_PATHS.length - 1].breathResponse,
      ],
      closestDistanceMeters: estimateClosestDistance(),
      fallbackMaterialCorrectionUsed,
      fishCount,
      materialAudits,
      selectedAnimationName:
        this.selectedAnimation?.name ?? null,
    };
  }

  update(
    state: BreathState,
    deltaSeconds: number,
    timeSeconds: number,
  ): void {
    const clampedDelta =
      Math.min(Math.max(deltaSeconds, 0), 0.05);
    const breathDamping =
      1 - Math.exp(-clampedDelta * 1.8);
    const colorDamping =
      1 - Math.exp(-clampedDelta * 4);
    const eased = MathUtils.smoothstep(state.progress, 0, 1);
    const colorBreath = state.phase === 'inhale'
      ? eased
      : 1 - eased;

    for (
      let index = 0;
      index < this.instances.length;
      index += 1
    ) {
      const instance = this.instances[index];
      const path = instance.path;
      const phase =
        timeSeconds * path.speed + path.phase;
      const targetBreathScale =
        breathRadiusScale(state, path.breathResponse);
      const baseX =
        path.center.x + Math.cos(phase) * path.radiusX;
      const baseY =
        path.center.y +
        Math.sin(phase * 1.31 + path.verticalPhase) *
          path.verticalAmplitude;
      const baseZ =
        path.center.z + Math.sin(phase) * path.radiusZ;

      instance.previousPosition.copy(
        instance.group.position,
      );
      instance.smoothedBreathScale =
        MathUtils.lerp(
          instance.smoothedBreathScale,
          targetBreathScale,
          breathDamping,
        );
      instance.group.position
        .set(baseX, baseY, baseZ)
        .sub(GUIDE_POINT)
        .multiplyScalar(instance.smoothedBreathScale)
        .add(GUIDE_POINT);

      instance.lookTarget
        .copy(instance.group.position)
        .sub(instance.previousPosition);

      if (instance.lookTarget.lengthSq() > 0.000001) {
        if (state.phase === 'inhale') {
          instance.guideBias
            .copy(GUIDE_POINT)
            .sub(instance.group.position);
          instance.lookTarget.addScaledVector(
            instance.guideBias,
            0.035 * path.breathResponse,
          );
        }

        instance.smoothedHeading.lerp(
          instance.lookTarget.normalize(),
          0.035,
        );
        instance.lookTarget
          .copy(instance.group.position)
          .add(instance.smoothedHeading);
        instance.group.lookAt(instance.lookTarget);
        instance.group.rotation.y +=
          instance.headingOffsetY;
        instance.group.rotation.z +=
          MathUtils.clamp(
            -instance.smoothedHeading.x * 0.16,
            -0.08,
            0.08,
          );
      }

      // Maintain texture/eye markings while brightening only the
      // butterflyfish body colors through each breathing cycle.
      for (const target of instance.breathTintTargets) {
        instance.tintScratch
          .copy(target.restingColor)
          .lerp(
            instance.breathAccentColor,
            colorBreath * target.accentStrength,
          )
          .multiplyScalar(
            1 + colorBreath * target.brightnessStrength,
          );
        target.material.color.lerp(
          instance.tintScratch,
          colorDamping,
        );
      }

      instance.mixer?.update(clampedDelta);
    }
  }

  dispose(): void {
    for (const instance of this.instances) {
      instance.mixer?.stopAllAction();
    }

    this.root.removeFromParent();
  }
}
