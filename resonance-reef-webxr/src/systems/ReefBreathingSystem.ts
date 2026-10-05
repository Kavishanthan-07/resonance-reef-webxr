import { createSystem } from '@iwsdk/core';

import {
  BreathEngine,
  type BreathPhase,
} from '../breathing/BreathEngine.js';

import { FishSchool } from '../ocean/FishSchool.js';
import { JellyfishGuide } from '../ocean/JellyfishGuide.js';

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

  private previousPhase:
    | BreathPhase
    | null = null;

  init(): void {
    /*
     * Jellyfish breathing guide.
     */
    this.jellyfish =
      new JellyfishGuide();

    this.world.createTransformEntity(
      this.jellyfish.root,
    );

    /*
     * Procedural fish school.
     */
    this.fishSchool =
      new FishSchool(24);

    this.world.createTransformEntity(
      this.fishSchool.root,
    );

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
    if (
      this.jellyfish == null ||
      this.fishSchool == null
    ) {
      return;
    }

    /*
     * ONE shared breath signal.
     */
    const state =
      this.breathing.update(delta);

    /*
     * Every environmental system receives the same state.
     */
    this.jellyfish.update(
      state,
      time,
    );

    this.fishSchool.update(
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
}