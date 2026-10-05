/**
 * Resonance Reef
 *
 * Bioresponsive WebXR underwater breathing experience.
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';

import { ReefBreathingSystem } from './systems/ReefBreathingSystem.js';

const sceneContainer = document.getElementById('scene-container');

if (!(sceneContainer instanceof HTMLDivElement)) {
  throw new Error('Missing #scene-container');
}

World.create(sceneContainer, projectOptions)
  .then((world) => {
    world.registerSystem(ReefBreathingSystem);
  })
  .catch((error: unknown) => {
    console.error(
      '[Resonance Reef] Failed to initialize IWSDK world.',
      error,
    );
  });