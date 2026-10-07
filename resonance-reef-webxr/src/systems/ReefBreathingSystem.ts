import {
  AssetManager,
  createSystem,
  Mesh,
  type Object3D,
  type AnimationClip,
} from '@iwsdk/core';

import {
  BreathEngine,
} from '../breathing/BreathEngine.js';

import { OceanAudio } from '../audio/OceanAudio.js';
import { BreathGuidance } from '../experience/BreathGuidance.js';
import { DesktopControls } from '../experience/DesktopControls.js';
import { ExperienceController } from '../experience/ExperienceController.js';
import { ExperienceXRControls } from '../experience/ExperienceXRControls.js';
import { MantaFinale } from '../experience/MantaFinale.js';
import { SessionController } from '../experience/SessionController.js';
import { BassFishTest } from '../ocean/BassFishTest.js';
import { BioluminescentPlankton } from '../ocean/BioluminescentPlankton.js';
import { FishSchool } from '../ocean/FishSchool.js';
import { JellyfishGuide } from '../ocean/JellyfishGuide.js';
import { ReefEnvironment } from '../ocean/ReefEnvironment.js';
import { WaterCurrent } from '../ocean/WaterCurrent.js';

function selectFishAnimation(
  clips: readonly AnimationClip[],
): AnimationClip | null {
  if (clips.length === 0) {
    return null;
  }

  const priorities = [
    'swim',
    'swimming',
    'idle',
  ];

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

type RepresentativeMaterialLabel =
  | 'coral'
  | 'seaweed'
  | 'rock'
  | 'reefFish';

interface MaterialLike {
  color?: {
    getHexString?: () => string;
  };
  emissive?: {
    getHexString?: () => string;
  };
  map?: {
    uuid?: string;
  } | null;
  uuid?: string;
}

interface MaterialState {
  colorHex: string | null;
  emissiveHex: string | null;
  mapUuid: string | null;
  uuid: string | null;
}

interface MaterialSnapshot extends MaterialState {
  material: unknown;
}

interface RendererState {
  outputColorSpace: unknown;
  overrideMaterial: boolean;
  toneMapping: unknown;
  toneMappingExposure: unknown;
}

function colorHex(
  color: MaterialLike['color'],
): string | null {
  if (typeof color?.getHexString !== 'function') {
    return null;
  }

  return color.getHexString();
}

function readMaterialState(
  material: unknown,
): MaterialState {
  const readable = material as MaterialLike;

  return {
    colorHex: colorHex(readable.color),
    emissiveHex: colorHex(readable.emissive),
    mapUuid: readable.map?.uuid ?? null,
    uuid: readable.uuid ?? null,
  };
}

function materialStateUnchanged(
  snapshot: MaterialSnapshot | null,
): boolean {
  if (snapshot == null) {
    return false;
  }

  const current =
    readMaterialState(snapshot.material);

  return (
    current.uuid === snapshot.uuid &&
    current.colorHex === snapshot.colorHex &&
    current.emissiveHex === snapshot.emissiveHex &&
    current.mapUuid === snapshot.mapUuid
  );
}

function objectNamePath(object: Object3D): string {
  const names: string[] = [];
  let current: Object3D | null = object;

  while (current != null) {
    if (current.name.length > 0) {
      names.push(current.name);
    }

    current = current.parent;
  }

  return names.reverse().join('/');
}

function firstMaterialInRoot(
  root: Object3D | null,
  matcher?: (namePath: string) => boolean,
): unknown | null {
  if (root == null) {
    return null;
  }

  let result: unknown | null = null;

  root.traverse((child) => {
    if (result != null || !(child instanceof Mesh)) {
      return;
    }

    if (
      matcher != null &&
      !matcher(objectNamePath(child))
    ) {
      return;
    }

    const mesh = child as Mesh & {
      material: unknown | unknown[];
    };

    result = Array.isArray(mesh.material)
      ? mesh.material[0] ?? null
      : mesh.material;
  });

  return result;
}

function makeMaterialSnapshot(
  material: unknown | null,
): MaterialSnapshot | null {
  if (material == null) {
    return null;
  }

  return {
    material,
    ...readMaterialState(material),
  };
}

export class ReefBreathingSystem extends createSystem({}) {
  private readonly breathing =
    new BreathEngine({
      inhaleSeconds: 5,
      exhaleSeconds: 5,
    });

  private readonly sessionController =
    new SessionController();

  private jellyfish:
    | JellyfishGuide
    | null = null;

  private fishSchool:
    | FishSchool
    | null = null;

  private bassFishTest:
    | BassFishTest
    | null = null;

  private environment:
    | ReefEnvironment
    | null = null;

  private waterCurrent:
    | WaterCurrent
    | null = null;

  private plankton:
    | BioluminescentPlankton
    | null = null;

  private oceanAudio:
    | OceanAudio
    | null = null;

  private mantaFinale:
    | MantaFinale
    | null = null;

  private experienceController:
    | ExperienceController
    | null = null;

  private desktopControls:
    | DesktopControls
    | null = null;

  private xrControls:
    | ExperienceXRControls
    | null = null;

  private breathGuidance:
    | BreathGuidance
    | null = null;

  init(): void {
    this.environment =
      new ReefEnvironment(this.world);

    this.world.createTransformEntity(
      this.environment.root,
    );

    this.cleanupFuncs.push(() => {
      this.environment?.dispose();
      this.oceanAudio?.dispose();
      this.mantaFinale?.reset();
      this.bassFishTest?.dispose();
      this.breathGuidance?.dispose();
      this.desktopControls?.dispose();
      this.xrControls?.dispose();
    });

    /*
     * Jellyfish breathing guide.
     */
    this.jellyfish =
      new JellyfishGuide();

    this.world.createTransformEntity(
      this.jellyfish.root,
    );

    this.breathGuidance =
      new BreathGuidance();

    this.world.createTransformEntity(
      this.breathGuidance.root,
    );

    this.waterCurrent =
      new WaterCurrent();

    this.world.createTransformEntity(
      this.waterCurrent.root,
    );

    this.plankton =
      new BioluminescentPlankton();

    this.world.createTransformEntity(
      this.plankton.points,
    );

    this.oceanAudio =
      new OceanAudio(this.world);

    this.mantaFinale =
      new MantaFinale();

    this.world.createTransformEntity(
      this.mantaFinale.root,
    );

    this.experienceController =
      new ExperienceController({
        resetExperience: () => {
          this.resetExperienceSystems();
        },
        resumeAudio: async () => {
          await this.oceanAudio?.resume();
        },
        setMuted: (muted) => {
          this.oceanAudio?.setMuted(muted);
        },
      });

    this.desktopControls =
      new DesktopControls(this.experienceController);
    this.xrControls =
      new ExperienceXRControls(
        this.world,
        this.experienceController,
      );

    void this.loadFishSchool().then(() =>
      this.loadBassFishTest(),
    );
    void this.loadMantaFinale();
  }

  update(
    delta: number,
    time: number,
  ): void {
    const experience =
      this.experienceController?.getState();
    const isRunning =
      experience?.phase === 'running';
    const state = isRunning
      ? this.breathing.update(delta)
      : this.breathing.getState();
    const session = isRunning
      ? this.sessionController.update(state)
      : this.sessionController.getState();
    const current = isRunning
      ? this.waterCurrent?.update(
          state,
          delta,
        )
      : undefined;

    /*
     * Every environmental system receives the same state.
     */
    if (isRunning) {
      this.jellyfish?.update(
        state,
        time,
      );
    }

    this.environment?.update(
      isRunning ? delta : 0,
      time,
      current,
      session,
      state,
    );

    if (isRunning && current != null) {
      this.plankton?.update(
        state,
        current,
        delta,
        time,
        session,
      );

      this.oceanAudio?.update(
        state,
        current,
        delta,
        time,
        session,
      );
    }

    if (isRunning && session.finaleTriggered) {
      this.mantaFinale?.start();
    }

    if (isRunning) {
      this.mantaFinale?.update(delta);

      if (this.mantaFinale?.isComplete === true) {
        this.experienceController?.markComplete();
      }
    }

    if (isRunning) {
      this.fishSchool?.update(
        state,
        delta,
        time,
        current,
        session,
      );
    }

    this.bassFishTest?.update(
      isRunning ? delta : 0,
      time,
    );

    this.desktopControls?.update(state, session);
    this.breathGuidance?.update(
      state,
      experience?.phase ?? 'ready',
      isRunning ? delta : 0,
    );
    this.xrControls?.update();
  }

  private resetExperienceSystems(): void {
    this.breathing.reset();
    this.sessionController.reset();
    this.waterCurrent?.reset();
    this.environment?.resetProgression();
    this.plankton?.reset();
    this.fishSchool?.reset();
    this.mantaFinale?.reset();
  }

  private async loadMantaFinale(): Promise<void> {
    try {
      const gltf =
        await AssetManager.loadGLTFById(
          'manta-ray',
        );

      console.log(
        '[Resonance Reef] Loaded manta-ray',
      );

      const clone =
        AssetManager.getGLTF(
          'manta-ray',
        );

      if (clone == null) {
        throw new Error(
          'Cached manta-ray GLTF clone was unavailable.',
        );
      }

      const result =
        this.mantaFinale?.setAsset({
          animations: gltf.animations,
          visual: clone.scene,
        });

      const animationNames =
        result?.animationNames ?? [];

      console.log(
        `[Resonance Reef] manta-ray animations: ${
          animationNames.length > 0
            ? animationNames.join(', ')
            : '(none)'
        }`,
      );

      if (result?.selectedAnimation == null) {
        console.warn(
          '[Resonance Reef] manta-ray has no selected animation; moving static manta.',
        );
      } else {
        console.log(
          `[Resonance Reef] manta-ray selected animation: ${result.selectedAnimation}`,
        );
      }
    } catch (error: unknown) {
      console.error(
        '[Resonance Reef] Failed to load manta-ray GLB.',
        error,
      );
    }
  }

  private async loadFishSchool(): Promise<void> {
    try {
      const gltf =
        await AssetManager.loadGLTFById(
          'reef-fish-a',
        );

      console.log(
        '[Resonance Reef] Loaded reef-fish-a',
      );

      const animationNames = gltf.animations.map(
        (clip) => clip.name,
      );

      console.log(
        `[Resonance Reef] reef-fish-a animations: ${
          animationNames.length > 0
            ? animationNames.join(', ')
            : '(none)'
        }`,
      );

      const selectedAnimation =
        selectFishAnimation(gltf.animations);

      if (selectedAnimation == null) {
        console.warn(
          '[Resonance Reef] reef-fish-a has no animation clips; rendering static fish.',
        );
      } else {
        console.log(
          `[Resonance Reef] reef-fish-a selected animation: ${selectedAnimation.name}`,
        );
      }

      this.fishSchool =
        new FishSchool({
          count: 8,
          species: {
            headingOffsetY: 0,
            modelScale: 0.105,
          },
          swimClip: selectedAnimation,
          visualFactory: () => {
            const clone =
              AssetManager.getGLTF(
                'reef-fish-a',
              );

            if (clone == null) {
              throw new Error(
                'Cached reef-fish-a GLTF clone was unavailable.',
              );
            }

            return clone.scene;
          },
        });

      this.world.createTransformEntity(
        this.fishSchool.root,
      );
    } catch (error: unknown) {
      console.error(
        '[Resonance Reef] Failed to load reef-fish-a GLB.',
        error,
      );
    }
  }

  private captureRepresentativeMaterials(): Record<
    RepresentativeMaterialLabel,
    MaterialSnapshot | null
  > {
    return {
      coral: makeMaterialSnapshot(
        firstMaterialInRoot(
          this.environment?.root ?? null,
          (namePath) =>
            /ReefCoral|ReefFanCoral/.test(namePath),
        ),
      ),
      seaweed: makeMaterialSnapshot(
        firstMaterialInRoot(
          this.environment?.root ?? null,
          (namePath) =>
            /ReefSeagrass/.test(namePath),
        ),
      ),
      rock: makeMaterialSnapshot(
        firstMaterialInRoot(
          this.environment?.root ?? null,
          (namePath) =>
            /ReefHeroRock|ReefFogRock/.test(namePath),
        ),
      ),
      reefFish: makeMaterialSnapshot(
        firstMaterialInRoot(
          this.fishSchool?.root ?? null,
        ),
      ),
    };
  }

  private captureRendererState(): RendererState {
    const rendererWithState =
      this.renderer as typeof this.renderer & {
        outputColorSpace?: unknown;
        toneMappingExposure?: unknown;
      };
    const sceneWithOverride =
      this.world.scene as typeof this.world.scene & {
        overrideMaterial?: unknown;
      };

    return {
      outputColorSpace:
        rendererWithState.outputColorSpace ?? 'n/a',
      overrideMaterial:
        sceneWithOverride.overrideMaterial != null,
      toneMapping: this.renderer.toneMapping,
      toneMappingExposure:
        rendererWithState.toneMappingExposure ?? 'n/a',
    };
  }

  private async loadBassFishTest(): Promise<void> {
    try {
      const materialSnapshots =
        this.captureRepresentativeMaterials();
      const rendererBefore =
        this.captureRendererState();
      const gltf =
        await AssetManager.loadGLTFById(
          'bass-fish',
        );

      console.log(
        '[Resonance Reef] Loaded bass-fish',
      );

      const animationNames = gltf.animations.map(
        (clip) => clip.name,
      );

      console.log(
        `[Resonance Reef] bass-fish animations: ${
          animationNames.length > 0
            ? animationNames.join(', ')
            : '(none)'
        }`,
      );

      this.bassFishTest =
        new BassFishTest(
          () => {
            const clone =
              AssetManager.getGLTF(
                'bass-fish',
              );

            if (clone == null) {
              throw new Error(
                'Cached bass-fish GLTF clone was unavailable.',
              );
            }

            return clone.scene;
          },
          gltf.animations,
        );

      if (
        this.bassFishTest.report.selectedAnimationName == null
      ) {
        console.warn(
          '[Resonance Reef] bass-fish has no animation clips; rendering static A/B test fish.',
        );
      } else {
        console.log(
          `[Resonance Reef] bass-fish selected animation: ${this.bassFishTest.report.selectedAnimationName}`,
        );
      }

      this.world.createTransformEntity(
        this.bassFishTest.root,
      );

      const rendererAfter =
        this.captureRendererState();
      const isolationCheck = {
        coral:
          materialStateUnchanged(
            materialSnapshots.coral,
          ),
        seaweed:
          materialStateUnchanged(
            materialSnapshots.seaweed,
          ),
        rock:
          materialStateUnchanged(
            materialSnapshots.rock,
          ),
        reefFish:
          materialStateUnchanged(
            materialSnapshots.reefFish,
          ),
      };

      console.log(
        `[Resonance Reef] Bass material isolation check:
coral unchanged: ${isolationCheck.coral}
seaweed unchanged: ${isolationCheck.seaweed}
rock unchanged: ${isolationCheck.rock}
reef fish unchanged: ${isolationCheck.reefFish}`,
      );

      const bassFishReport =
        this.bassFishTest.report;
      const materialNames =
        bassFishReport.materialAudits
          .map((material) => material.name)
          .join(', ');
      const materialTypes =
        bassFishReport.materialAudits
          .map((material) => material.type)
          .join(', ');
      const materialMaps =
        bassFishReport.materialAudits
          .map((material) =>
            material.hasMap ? 'map' : 'no-map',
          )
          .join(', ');
      const materialClones =
        bassFishReport.materialAudits
          .map((material) =>
            material.cloned ? 'cloned' : 'not-cloned',
          )
          .join(', ');

      console.log(
        `[Resonance Reef] bass-fish test report: objects=${bassFishReport.bassObjectNames.join(', ')}, meshes=${bassFishReport.meshCount}, skinnedMeshes=${bassFishReport.skinnedMeshCount}, materials=${bassFishReport.materialCount}, materialNames=${materialNames || '(none)'}, materialTypes=${materialTypes || '(none)'}, materialMaps=${materialMaps || '(none)'}, materialCloned=${materialClones || '(none)'}, textureMaps=${bassFishReport.originalTextureMapsPresent ? 'present' : 'missing'}, bodyColor=${bassFishReport.bodyColor}, detail=${bassFishReport.detailColor}, roughness=${bassFishReport.roughness.toFixed(2)}, metalness=${bassFishReport.metalness.toFixed(2)}, emissive=${bassFishReport.emissive}, emissiveIntensity=${bassFishReport.emissiveIntensity}, scale=${bassFishReport.scale.toFixed(4)}, headingOffsetY=${bassFishReport.headingOffsetY}, animationSpeed=${bassFishReport.speedRange[0].toFixed(2)}-${bassFishReport.speedRange[1].toFixed(2)}, dedicatedMaterial=${bassFishReport.materialTreatmentApplied ? 'applied' : 'not-applied'}, separateFinMaterial=${bassFishReport.separateFinMaterialFound ? 'found' : 'not-found'}, rendererBeforeToneMapping=${rendererBefore.toneMapping}, rendererAfterToneMapping=${rendererAfter.toneMapping}, rendererBeforeToneMappingExposure=${rendererBefore.toneMappingExposure}, rendererAfterToneMappingExposure=${rendererAfter.toneMappingExposure}, rendererBeforeOutputColorSpace=${rendererBefore.outputColorSpace}, rendererAfterOutputColorSpace=${rendererAfter.outputColorSpace}, worldSceneOverrideMaterial=${rendererAfter.overrideMaterial}`,
      );
    } catch (error: unknown) {
      console.error(
        '[Resonance Reef] Failed to load bass-fish GLB.',
        error,
      );
    }
  }
}
