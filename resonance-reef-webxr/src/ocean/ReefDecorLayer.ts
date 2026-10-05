import {
  AnimationMixer,
  AssetManager,
  Group,
  Mesh,
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
      this.addCoralTarget(root, visual, placement);
    } else {
      this.addSeaweedTarget(root, placement);
      this.addSeaweedAnimation(root, animations);
    }
  }

  private addCoralTarget(
    root: Group,
    visual: Object3D,
    placement: ReefDecorPlacement,
  ): void {
    const materials =
      collectStandardMaterials(visual);

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
      amplitude: 0.018 + Math.random() * 0.018,
      baseRotationX: root.rotation.x,
      baseRotationZ: root.rotation.z,
      bendX: 0,
      bendZ: 0,
      hitPulseId: 0,
      impact: 0,
      phase: Math.random() * Math.PI * 2,
      responsiveness: placement.responsiveness,
      root,
      speed: 0.18 + Math.random() * 0.16,
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

    action.timeScale = 0.55;
    action.play();
    this.mixers.push(mixer);
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
