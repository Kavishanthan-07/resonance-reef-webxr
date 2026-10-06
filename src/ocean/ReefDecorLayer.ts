import {
  AnimationMixer,
  AssetManager,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type AnimationClip,
  type Object3D,
} from '@iwsdk/core';

import {
  REEF_CORAL_PLACEMENTS,
  REEF_SEAWEED_PLACEMENTS,
  type ReefDecorAssetId,
  type ReefDecorPlacement,
} from './ReefDecorConfig.js';
import type {
  CoralTarget,
  SwayTarget,
} from './ReefResponseTargets.js';

interface ReefDecorLayerTargets {
  coralTargets: CoralTarget[];
  swayTargets: SwayTarget[];
}

const CORAL_TINT_BY_ASSET: Record<ReefDecorAssetId, number> = {
  'coral-a': 0x9a8d78,
  'coral-c': 0x82666f,
  'coral-d': 0x66787d,
  'coral-f': 0x6f6579,
  'seaweed-a': 0x214f47,
  'seaweed-b': 0x245447,
  'seaweed-c': 0x1f4c45,
};

interface TintableMaterial {
  color?: Color;
  emissive?: Color;
  emissiveIntensity?: number;
  fog?: boolean;
  metalness?: number;
  needsUpdate?: boolean;
  roughness?: number;
}

function setNoShadows(object: Object3D): void {
  object.traverse((child) => {
    child.castShadow = false;
    child.receiveShadow = false;
  });
}

function collectStandardMaterials(
  object: Object3D,
): MeshStandardMaterial[] {
  const materials = new Set<MeshStandardMaterial>();

  object.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    const childMaterials = Array.isArray(child.material)
      ? child.material
      : [child.material];

    for (const material of childMaterials) {
      if (material instanceof MeshStandardMaterial) {
        materials.add(material);
      }
    }
  });

  return [...materials];
}

export class ReefDecorLayer {
  readonly root = new Group();

  readonly coralPlacementCount =
    REEF_CORAL_PLACEMENTS.length;
  readonly seaweedPlacementCount =
    REEF_SEAWEED_PLACEMENTS.length;

  private readonly mixers: AnimationMixer[] = [];
  private readonly loggedSeaweedAssets =
    new Set<ReefDecorAssetId>();
  private loadPromise: Promise<void> | null = null;

  constructor(
    private readonly targets: ReefDecorLayerTargets,
  ) {
    this.root.name = 'ResonanceReefImportedDecor';
  }

  load(): Promise<void> {
    this.loadPromise ??= this.loadDecor();

    return this.loadPromise;
  }

  update(deltaSeconds: number): void {
    if (deltaSeconds <= 0) {
      return;
    }

    const mixerDelta = deltaSeconds * 0.55;

    for (const mixer of this.mixers) {
      mixer.update(mixerDelta);
    }
  }

  private async loadDecor(): Promise<void> {
    const placements = [
      ...REEF_CORAL_PLACEMENTS,
      ...REEF_SEAWEED_PLACEMENTS,
    ];
    const animationByAsset =
      new Map<ReefDecorAssetId, readonly AnimationClip[]>();
    const uniqueAssetIds = [
      ...new Set(
        placements.map((placement) => placement.assetId),
      ),
    ];

    await Promise.all(
      uniqueAssetIds.map(async (assetId) => {
        const gltf =
          await AssetManager.loadGLTFById(assetId);

        animationByAsset.set(
          assetId,
          gltf.animations,
        );

        if (assetId.startsWith('seaweed')) {
          this.logSeaweedAnimations(
            assetId,
            gltf.animations,
          );
        }
      }),
    );

    for (const placement of placements) {
      const clone =
        AssetManager.getGLTF(placement.assetId);

      if (clone == null) {
        throw new Error(
          `Cached ${placement.assetId} GLTF clone was unavailable.`,
        );
      }

      this.addPlacement(
        placement,
        clone.scene,
        animationByAsset.get(placement.assetId) ?? [],
      );
    }

    console.log(
      `[Resonance Reef] Imported decor loaded: ${this.coralPlacementCount} coral, ${this.seaweedPlacementCount} seaweed.`,
    );
  }

  private addPlacement(
    placement: ReefDecorPlacement,
    visual: Object3D,
    animations: readonly AnimationClip[],
  ): void {
    const root = new Group();
    const materials =
      this.polishImportedMaterials(visual, placement);

    root.name = placement.name;
    root.position.set(
      placement.position[0],
      placement.position[1],
      placement.position[2],
    );
    root.rotation.set(
      placement.rotation[0],
      placement.rotation[1],
      placement.rotation[2],
    );
    root.scale.setScalar(placement.scale);
    setNoShadows(visual);
    root.add(visual);
    this.root.add(root);

    if (placement.category === 'coral') {
      this.addCoralTarget(root, placement, materials);
    } else {
      this.addSeaweedTarget(root, placement);
      this.addSeaweedAnimation(root, animations);
    }
  }

  private addCoralTarget(
    root: Group,
    placement: ReefDecorPlacement,
    materials: MeshStandardMaterial[],
  ): void {
    this.targets.coralTargets.push({
      baseColors: materials.map((material) =>
        material.color.clone(),
      ),
      baseEmissives: materials.map((material) =>
        material.emissive.clone(),
      ),
      hitPulseId: 0,
      impact: 0,
      materials,
      responsiveness: placement.responsiveness,
      root,
    });
  }

  private addSeaweedTarget(
    root: Group,
    placement: ReefDecorPlacement,
  ): void {
    this.targets.swayTargets.push({
      amplitude: 0.012 + Math.random() * 0.012,
      baseRotationX: root.rotation.x,
      baseRotationZ: root.rotation.z,
      bendX: 0,
      bendZ: 0,
      hitPulseId: 0,
      impact: 0,
      phase: Math.random() * Math.PI * 2,
      responsiveness: placement.responsiveness,
      root,
      speed: 0.14 + Math.random() * 0.12,
    });
  }

  private addSeaweedAnimation(
    root: Group,
    animations: readonly AnimationClip[],
  ): void {
    if (animations.length === 0) {
      return;
    }

    const mixer = new AnimationMixer(root);
    const action = mixer.clipAction(animations[0]);

    action.timeScale = 0.42;
    action.play();
    this.mixers.push(mixer);
  }

  private polishImportedMaterials(
    visual: Object3D,
    placement: ReefDecorPlacement,
  ): MeshStandardMaterial[] {
    const materials = collectStandardMaterials(visual);
    const tint = new Color(
      CORAL_TINT_BY_ASSET[placement.assetId],
    );
    const emissiveTint = new Color(
      placement.category === 'coral'
        ? 0x071211
        : 0x03100d,
    );
    const tintStrength =
      placement.category === 'coral' ? 0.72 : 0.78;
    const minRoughness =
      placement.category === 'coral' ? 0.88 : 0.94;

    for (const material of materials) {
      material.color.lerp(tint, tintStrength);
      material.color.multiplyScalar(
        placement.category === 'coral' ? 0.82 : 0.9,
      );
      material.emissive.lerp(emissiveTint, 0.82);
      material.emissiveIntensity = Math.min(
        material.emissiveIntensity,
        placement.category === 'coral' ? 0.08 : 0.025,
      );
      material.metalness = 0;
      material.roughness = Math.max(
        material.roughness,
        minRoughness,
      );
      material.needsUpdate = true;
    }

    visual.traverse((child) => {
      if (!(child instanceof Mesh)) {
        return;
      }

      const childMaterials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      for (const material of childMaterials) {
        const tintable = material as TintableMaterial;

        tintable.color?.lerp(tint, tintStrength);
        tintable.color?.multiplyScalar(
          placement.category === 'coral' ? 0.82 : 0.9,
        );
        tintable.emissive?.lerp(emissiveTint, 0.88);

        if (tintable.emissiveIntensity != null) {
          tintable.emissiveIntensity = Math.min(
            tintable.emissiveIntensity,
            placement.category === 'coral' ? 0.025 : 0.012,
          );
        }

        if (tintable.metalness != null) {
          tintable.metalness = 0;
        }

        if (tintable.roughness != null) {
          tintable.roughness = Math.max(
            tintable.roughness,
            minRoughness,
          );
        }

        if (material instanceof MeshBasicMaterial) {
          material.fog = true;
        }

        tintable.needsUpdate = true;
      }
    });

    return materials;
  }

  private logSeaweedAnimations(
    assetId: ReefDecorAssetId,
    animations: readonly AnimationClip[],
  ): void {
    if (this.loggedSeaweedAssets.has(assetId)) {
      return;
    }

    this.loggedSeaweedAssets.add(assetId);
    console.log(
      `[Resonance Reef] ${assetId} animations: ${
        animations.length > 0
          ? animations
              .map((clip) => clip.name)
              .join(', ')
          : '(none)'
      }`,
    );
  }
}
