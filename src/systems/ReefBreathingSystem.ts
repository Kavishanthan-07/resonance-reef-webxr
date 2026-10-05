import { createSystem } from '@iwsdk/core';

import {
  BreathEngine,
  type BreathPhase,
} from '../breathing/BreathEngine.js';

import { JellyfishGuide } from '../ocean/JellyfishGuide.js';

export class ReefBreathingSystem extends createSystem({}) {
  private readonly breathing = new BreathEngine({
    inhaleSeconds: 5,
    exhaleSeconds: 5,
  });

  private jellyfish: JellyfishGuide | null = null;
  private previousPhase: BreathPhase | null = null;

  init(): void {
    this.jellyfish = new JellyfishGuide();

    /*
     * Register the Three.js hierarchy with IWSDK so its lifecycle
     * belongs to the active XR world.
     */
    this.world.createTransformEntity(this.jellyfish.root);

    const initialState = this.breathing.getState();
    this.previousPhase = initialState.phase;

    console.info(
      `[Resonance Reef] Breath phase: ${initialState.phase.toUpperCase()}`,
    );
  }

  update(delta: number, time: number): void {
    if (this.jellyfish == null) {
      return;
    }

    const state = this.breathing.update(delta);

    this.jellyfish.update(state, time);

    if (state.phase !== this.previousPhase) {
      this.previousPhase = state.phase;

      console.info(
        `[Resonance Reef] Breath phase: ${state.phase.toUpperCase()}`,
      );
    }
  }
}