import {
  AssetManager,
  createSystem,
  type AnimationClip,
} from '@iwsdk/core';

import {
  BreathEngine,
  type BreathPhase,
} from '../breathing/BreathEngine.js';

import { FishSchool } from '../ocean/FishSchool.js';
import { JellyfishGuide } from '../ocean/JellyfishGuide.js';
import { ReefEnvironment } from '../ocean/ReefEnvironment.js';

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

  private jellyfish:
    | JellyfishGuide
    | null = null;

  private fishSchool:
    | FishSchool
    | null = null;

  private environment:
    | ReefEnvironment
    | null = null;

  private previousPhase:
    | BreathPhase
    | null = null;

  init(): void {
    this.environment =
      new ReefEnvironment(this.world);

    this.world.createTransformEntity(
      this.environment.root,
    );

    this.cleanupFuncs.push(() => {
      this.environment?.dispose();
    });

    /*
     * Jellyfish breathing guide.
     */
    this.jellyfish =
      new JellyfishGuide();

    this.world.createTransformEntity(
      this.jellyfish.root,
    );

    void this.loadFishSchool();

    const initialState =
      this.breathing.getState();

    this.previousPhase =
      initialState.phase;

    console.log(
      `[Resonance Reef] Breath phase: ${initialState.phase.toUpperCase()}`,
    );
  }

  update(
    delta: number,
    time: number,
  ): void {
    /*
     * ONE shared breath signal.
     */
    const state =
      this.breathing.update(delta);

    /*
     * Every environmental system receives the same state.
     */
    this.jellyfish?.update(
      state,
      time,
    );

    this.environment?.update(
      delta,
      time,
    );

    this.fishSchool?.update(
      state,
      delta,
      time,
    );

    if (
      state.phase !==
      this.previousPhase
    ) {
      this.previousPhase =
        state.phase;

      console.log(
        `[Resonance Reef] Breath phase: ${state.phase.toUpperCase()}`,
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
          count: 10,
          species: {
            headingOffsetY: 0,
            modelScale: 0.18,
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
}
