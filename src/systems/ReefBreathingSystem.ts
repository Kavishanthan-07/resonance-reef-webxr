import {
  AssetManager,
  createSystem,
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
import { BioluminescentPlankton } from '../ocean/BioluminescentPlankton.js';
import {
  BUTTERFLY_FISH_HEADING_OFFSET_Y,
  BUTTERFLY_FISH_SCALE,
  HERO_BUTTERFLY_FISH_COUNT,
  ButterflyFishHeroLayer,
} from '../ocean/ButterflyFishHeroLayer.js';
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

  private butterflyFishHeroLayer:
    | ButterflyFishHeroLayer
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
      this.butterflyFishHeroLayer?.dispose();
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

    void this.loadFishSchool();
    void this.loadButterflyFishHeroLayer();
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

    this.butterflyFishHeroLayer?.update(
      state,
      delta,
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

  private async loadButterflyFishHeroLayer(): Promise<void> {
    try {
      const gltf =
        await AssetManager.loadGLTFById(
          'butterfly-fish',
        );

      console.log(
        '[Resonance Reef] Loaded butterfly-fish hero asset',
      );

      this.butterflyFishHeroLayer =
        new ButterflyFishHeroLayer({
          animations: gltf.animations,
          visualFactory: () => {
            const clone =
              AssetManager.getGLTF(
                'butterfly-fish',
              );

            if (clone == null) {
              throw new Error(
                'Cached butterfly-fish GLTF clone was unavailable.',
              );
            }

            return clone.scene;
          },
        });

      this.world.createTransformEntity(
        this.butterflyFishHeroLayer.root,
      );

      const report =
        this.butterflyFishHeroLayer.report;
      const materialSummary =
        report.materialAudits
          .map((material) =>
            `${material.materialName}:${material.materialType}:map=${material.mapName ?? 'none'}:${material.mapSize ?? 'unknown'}:normal=${material.normalMapName ?? 'none'}:${material.normalMapSize ?? 'unknown'}`,
          )
          .join(', ');

      console.log(
        `[Resonance Reef] butterfly-fish hero layer: instances=${HERO_BUTTERFLY_FISH_COUNT}, animations=${
          report.animationNames.length > 0
            ? report.animationNames.join(', ')
            : '(none)'
        }, selectedAnimation=${report.selectedAnimationName ?? '(none)'}, scale=${BUTTERFLY_FISH_SCALE.toFixed(3)}, headingOffsetY=${BUTTERFLY_FISH_HEADING_OFFSET_Y.toFixed(3)}, breathResponse=${(report.breathResponseRange[0] * 100).toFixed(1)}%-${(report.breathResponseRange[1] * 100).toFixed(1)}%, closestDistance=${report.closestDistanceMeters.toFixed(2)}m, fallbackMaterialCorrection=${report.fallbackMaterialCorrectionUsed ? 'used' : 'not-used'}, materials=${materialSummary || '(none)'}`,
      );
    } catch (error: unknown) {
      console.error(
        '[Resonance Reef] Failed to load butterfly-fish GLB.',
        error,
      );
    }
  }

}
