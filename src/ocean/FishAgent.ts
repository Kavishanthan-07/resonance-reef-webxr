import {
  AnimationClip,
  AnimationMixer,
  Color,
  Group,
  MathUtils,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from '@iwsdk/core';

import type { BreathState } from '../breathing/BreathEngine.js';

export interface FishAgentConfig {
  headingOffsetY: number;
  modelScale: number;
  phaseOffset: number;
  gatherOffset: Vector3;
  outwardBias: Vector3;
  root: Group;
  swimClip: AnimationClip | null;
  visual: Object3D;
  visualStyle?: FishVisualStyle;
  paletteTint?: Color;
  breathAccentColor?: Color;
}

export type FishVisualStyle =
  | 'legacy-muted'
  | 'natural-support';

const PRIMARY_FISH_TINT = new Color(0x587f83);
const PRIMARY_FISH_SILVER_TINT = new Color(0x668b8d);
const PRIMARY_FISH_EMISSIVE_TINT = new Color(0x041514);
const DEFAULT_SUPPORT_TINT = new Color(0x5b9f9c);
const DEFAULT_SUPPORT_ACCENT = new Color(0x88c8bd);

interface BreathTintTarget {
  inhaleColor: Color;
  material: MeshBasicMaterial | MeshStandardMaterial;
  restingColor: Color;
}

interface TintableMaterial {
  color?: Color;
  emissive?: Color;
  emissiveIntensity?: number;
  fog?: boolean;
  map?: unknown;
  metalness?: number;
  needsUpdate?: boolean;
  roughness?: number;
}

function createMutedFishMaterial(): MeshBasicMaterial {
  const color = PRIMARY_FISH_TINT.clone().lerp(
    PRIMARY_FISH_SILVER_TINT,
    0.12,
  );

  color.multiplyScalar(0.66);

  return new MeshBasicMaterial({
    color,
    fog: true,
  });
}

function tintFishMaterial(material: unknown): void {
  const tintable = material as TintableMaterial;

  tintable.color?.copy(PRIMARY_FISH_TINT).lerp(
    PRIMARY_FISH_SILVER_TINT,
    0.08,
  );
  tintable.color?.multiplyScalar(0.62);
  tintable.map = null;
  tintable.emissive?.lerp(
    PRIMARY_FISH_EMISSIVE_TINT,
    0.92,
  );

  if (tintable.emissiveIntensity != null) {
    tintable.emissiveIntensity = Math.min(
      tintable.emissiveIntensity,
      0.008,
    );
  }

  if (tintable.metalness != null) {
    tintable.metalness = 0;
  }

  if (tintable.roughness != null) {
    tintable.roughness = Math.max(
      tintable.roughness,
      0.9,
    );
  }

  if (tintable.fog != null) {
    tintable.fog = true;
  }

  tintable.needsUpdate = true;
}

function polishLegacyFishVisual(visual: Object3D): BreathTintTarget[] {
  visual.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];

    for (const material of materials) {
      tintFishMaterial(material);

      if (material instanceof MeshStandardMaterial) {
        material.color.copy(PRIMARY_FISH_TINT).lerp(
          PRIMARY_FISH_SILVER_TINT,
          0.12,
        );
        material.color.multiplyScalar(0.66);
        material.map = null;
        material.emissive.lerp(
          PRIMARY_FISH_EMISSIVE_TINT,
          0.82,
        );
        material.emissiveIntensity = Math.min(
          material.emissiveIntensity,
          0.012,
        );
        material.metalness = 0;
        material.roughness = Math.max(
          material.roughness,
          0.9,
        );
        material.needsUpdate = true;
      } else if (material instanceof MeshBasicMaterial) {
        material.color.copy(PRIMARY_FISH_TINT).lerp(
          PRIMARY_FISH_SILVER_TINT,
          0.12,
        );
        material.color.multiplyScalar(0.66);
        material.fog = true;
        material.needsUpdate = true;
      }
    }

    child.material = Array.isArray(child.material)
      ? materials.map(() => createMutedFishMaterial())
      : createMutedFishMaterial();
  });

  return [];
}

function tuneNaturalSupportMaterial(
  material: Material,
  paletteTint: Color,
  breathAccentColor: Color,
): BreathTintTarget | null {
  const materialName = material.name.toLowerCase();
  const isEye = materialName.includes('eye');
  const supportAccent =
    paletteTint.clone().lerp(breathAccentColor, 0.28);

  if (material instanceof MeshStandardMaterial) {
    if (isEye) {
      material.color.set(0x050706);
      material.roughness = Math.max(material.roughness, 0.42);
      material.metalness = 0;
      material.emissive.set(0x000000);
      material.emissiveIntensity = 0;
      material.needsUpdate = true;

      return null;
    }

    const lightMaterial =
      materialName.includes('light') ||
      materialName.includes('bottom');
    const finMaterial = materialName.includes('fin');
    const tintAmount =
      lightMaterial ? 0.42 : finMaterial ? 0.58 : 0.66;
    const brightness =
      lightMaterial ? 1.12 : finMaterial ? 0.82 : 0.94;

    material.color
      .lerp(paletteTint, tintAmount)
      .multiplyScalar(brightness);
    material.emissive.set(0x000000);
    material.emissiveIntensity = 0;
    material.metalness = 0;
    material.roughness = Math.max(
      material.roughness,
      finMaterial ? 0.86 : 0.74,
    );
    material.transparent = false;
    material.opacity = 1;
    material.needsUpdate = true;

    return {
      inhaleColor: material.color
        .clone()
        .lerp(supportAccent, lightMaterial ? 0.2 : 0.32)
        .multiplyScalar(1.08),
      material,
      restingColor: material.color.clone(),
    };
  }

  if (material instanceof MeshBasicMaterial) {
    if (isEye) {
      material.color.set(0x050706);
      material.fog = true;
      material.needsUpdate = true;

      return null;
    }

    material.color.lerp(paletteTint, 0.58);
    material.fog = true;
    material.needsUpdate = true;

    return {
      inhaleColor: material.color
        .clone()
        .lerp(supportAccent, 0.26)
        .multiplyScalar(1.08),
      material,
      restingColor: material.color.clone(),
    };
  }

  return null;
}

function polishNaturalSupportVisual(
  visual: Object3D,
  paletteTint: Color,
  breathAccentColor: Color,
): BreathTintTarget[] {
  const tintTargets: BreathTintTarget[] = [];

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
      const tintTarget =
        tuneNaturalSupportMaterial(
          material,
          paletteTint,
          breathAccentColor,
        );

      if (tintTarget != null) {
        tintTargets.push(tintTarget);
      }
    }

    child.material = Array.isArray(child.material)
      ? clonedMaterials
      : clonedMaterials[0];
  });

  return tintTargets;
}

export class FishAgent {
  readonly root: Group;
  readonly visual: Object3D;
  readonly velocity = new Vector3();
  readonly phaseOffset: number;
  readonly gatherOffset: Vector3;
  readonly outwardBias: Vector3;
  readonly headingOffsetY: number;

  private readonly mixer: AnimationMixer | null;
  private readonly breathTintTargets: BreathTintTarget[];
  private readonly tintScratch = new Color();
  private smoothedColorBreath = 0;

  constructor(config: FishAgentConfig) {
    this.root = config.root;
    this.visual = config.visual;
    this.phaseOffset = config.phaseOffset;
    this.gatherOffset = config.gatherOffset;
    this.outwardBias = config.outwardBias;
    this.headingOffsetY = config.headingOffsetY;

    this.visual.scale.setScalar(config.modelScale);
    this.breathTintTargets =
      config.visualStyle === 'natural-support'
        ? polishNaturalSupportVisual(
            this.visual,
            config.paletteTint ??
              DEFAULT_SUPPORT_TINT,
            config.breathAccentColor ??
              DEFAULT_SUPPORT_ACCENT,
          )
        : polishLegacyFishVisual(this.visual);
    this.root.add(this.visual);

    this.mixer =
      config.swimClip == null
        ? null
        : new AnimationMixer(this.visual);

    if (this.mixer != null && config.swimClip != null) {
      const action = this.mixer.clipAction(config.swimClip);

      action.timeScale = 0.72 + Math.random() * 0.16;
      action.play();
    }
  }

  updateAnimation(
    deltaSeconds: number,
    state?: BreathState,
  ): void {
    this.mixer?.update(deltaSeconds);

    if (
      state == null ||
      this.breathTintTargets.length === 0
    ) {
      return;
    }

    const clampedDelta =
      Math.min(Math.max(deltaSeconds, 0), 0.05);
    const colorDamping =
      1 - Math.exp(-clampedDelta * 3.2);
    const eased =
      MathUtils.smoothstep(state.progress, 0, 1);
    const targetBreath =
      state.phase === 'inhale' ? eased : 1 - eased;

    this.smoothedColorBreath =
      MathUtils.lerp(
        this.smoothedColorBreath,
        targetBreath,
        colorDamping,
      );

    for (const target of this.breathTintTargets) {
      this.tintScratch
        .copy(target.restingColor)
        .lerp(
          target.inhaleColor,
          this.smoothedColorBreath,
        );
      target.material.color.lerp(
        this.tintScratch,
        colorDamping,
      );
    }
  }
}
