import {
  AnimationClip,
  AnimationMixer,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from '@iwsdk/core';

export interface FishAgentConfig {
  headingOffsetY: number;
  modelScale: number;
  phaseOffset: number;
  gatherOffset: Vector3;
  outwardBias: Vector3;
  root: Group;
  swimClip: AnimationClip | null;
  visual: Object3D;
}

const PRIMARY_FISH_TINT = new Color(0x346766);
const PRIMARY_FISH_EMISSIVE_TINT = new Color(0x061817);

interface TintableMaterial {
  color?: Color;
  emissive?: Color;
  emissiveIntensity?: number;
  fog?: boolean;
  metalness?: number;
  needsUpdate?: boolean;
  roughness?: number;
}

function tintFishMaterial(material: unknown): void {
  const tintable = material as TintableMaterial;

  tintable.color?.lerp(PRIMARY_FISH_TINT, 0.94);
  tintable.color?.multiplyScalar(0.72);
  tintable.emissive?.lerp(
    PRIMARY_FISH_EMISSIVE_TINT,
    0.92,
  );

  if (tintable.emissiveIntensity != null) {
    tintable.emissiveIntensity = Math.min(
      tintable.emissiveIntensity,
      0.015,
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

function polishFishVisual(visual: Object3D): void {
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
        material.color.lerp(PRIMARY_FISH_TINT, 0.1);
        material.color.multiplyScalar(0.88);
        material.emissive.lerp(
          PRIMARY_FISH_EMISSIVE_TINT,
          0.82,
        );
        material.emissiveIntensity = Math.min(
          material.emissiveIntensity,
          0.035,
        );
        material.metalness = 0;
        material.roughness = Math.max(
          material.roughness,
          0.86,
        );
        material.needsUpdate = true;
      } else if (material instanceof MeshBasicMaterial) {
        material.color.lerp(PRIMARY_FISH_TINT, 0.1);
        material.color.multiplyScalar(0.88);
        material.fog = true;
        material.needsUpdate = true;
      }
    }
  });
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

  constructor(config: FishAgentConfig) {
    this.root = config.root;
    this.visual = config.visual;
    this.phaseOffset = config.phaseOffset;
    this.gatherOffset = config.gatherOffset;
    this.outwardBias = config.outwardBias;
    this.headingOffsetY = config.headingOffsetY;

    this.visual.scale.setScalar(config.modelScale);
    polishFishVisual(this.visual);
    this.root.add(this.visual);

    this.mixer =
      config.swimClip == null
        ? null
        : new AnimationMixer(this.visual);

    if (this.mixer != null && config.swimClip != null) {
      const action = this.mixer.clipAction(config.swimClip);

      action.timeScale = 0.9 + Math.random() * 0.2;
      action.play();
    }
  }

  updateAnimation(deltaSeconds: number): void {
    this.mixer?.update(deltaSeconds);
  }
}
