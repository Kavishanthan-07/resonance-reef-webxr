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

const PRIMARY_FISH_TINT = new Color(0x587f83);
const PRIMARY_FISH_SILVER_TINT = new Color(0x668b8d);
const PRIMARY_FISH_EMISSIVE_TINT = new Color(0x041514);

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

      action.timeScale = 0.72 + Math.random() * 0.16;
      action.play();
    }
  }

  updateAnimation(deltaSeconds: number): void {
    this.mixer?.update(deltaSeconds);
  }
}
