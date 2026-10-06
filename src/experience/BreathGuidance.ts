import {
  CanvasTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from '@iwsdk/core';

import type { BreathState } from '../breathing/BreathEngine.js';
import type { ExperiencePhase } from './ExperienceController.js';

export const READY_SCREEN_INSTRUCTION =
  'Follow the jellyfish.\nBreathe in as it expands.\nBreathe out as it contracts.';

export type BreathGuidanceLabel =
  | 'BREATHE IN'
  | 'BREATHE OUT';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothStep(value: number): number {
  const t = clamp01(value);

  return t * t * (3 - 2 * t);
}

export function getBreathGuidanceLabel(
  state: BreathState,
): BreathGuidanceLabel | null {
  if (state.completedCycles >= 2) {
    return null;
  }

  return state.phase === 'inhale'
    ? 'BREATHE IN'
    : 'BREATHE OUT';
}

export function getBreathGuidanceTargetOpacity(
  state: BreathState,
  experiencePhase: ExperiencePhase,
): number {
  if (
    experiencePhase !== 'running' ||
    getBreathGuidanceLabel(state) == null
  ) {
    return 0;
  }

  const fadeIn = smoothStep(state.elapsedInPhase / 0.34);
  const phaseEndSoftening =
    1 - smoothStep((state.progress - 0.84) / 0.16) * 0.28;

  return 0.78 * fadeIn * phaseEndSoftening;
}

export class BreathGuidance {
  readonly root = new Group();

  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private readonly material: MeshBasicMaterial;
  private readonly geometry: PlaneGeometry;
  private readonly mesh: Mesh;
  private opacity = 0;
  private renderedLabel: BreathGuidanceLabel | null = null;

  constructor() {
    this.root.name = 'ResonanceReefBreathGuidance';
    this.root.position.set(0, 2.22, -2.34);

    this.canvas.width = 512;
    this.canvas.height = 160;

    this.texture = new CanvasTexture(this.canvas);
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;

    this.material = new MeshBasicMaterial({
      color: 0xffffff,
      depthWrite: false,
      map: this.texture,
      opacity: 0,
      transparent: true,
    });
    this.geometry = new PlaneGeometry(1.16, 0.36);
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.name = 'ResonanceReefBreathGuidanceText';

    this.root.add(this.mesh);
    this.root.visible = false;
  }

  update(
    state: BreathState,
    experiencePhase: ExperiencePhase,
    deltaSeconds: number,
  ): void {
    const label = getBreathGuidanceLabel(state);
    const targetOpacity =
      getBreathGuidanceTargetOpacity(
        state,
        experiencePhase,
      );

    if (label != null && label !== this.renderedLabel) {
      this.renderedLabel = label;
      this.draw(label);
    }

    if (experiencePhase !== 'running') {
      this.opacity = 0;
    } else {
      const fadeSeconds =
        targetOpacity > this.opacity ? 0.34 : 0.8;
      const blend =
        fadeSeconds > 0
          ? clamp01(deltaSeconds / fadeSeconds)
          : 1;

      this.opacity +=
        (targetOpacity - this.opacity) * blend;
    }

    if (this.opacity < 0.01 && targetOpacity <= 0) {
      this.opacity = 0;
    }

    this.material.opacity = this.opacity;
    this.root.visible = this.opacity > 0.01;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }

  private draw(label: BreathGuidanceLabel): void {
    const context = this.canvas.getContext('2d');

    if (context == null) {
      return;
    }

    context.clearRect(
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );
    context.fillStyle = 'rgba(1, 15, 22, 0.38)';
    context.strokeStyle = 'rgba(141, 221, 231, 0.22)';
    context.lineWidth = 5;
    context.beginPath();
    context.roundRect(34, 34, 444, 92, 30);
    context.fill();
    context.stroke();

    context.shadowColor = 'rgba(0, 5, 9, 0.92)';
    context.shadowBlur = 14;
    context.fillStyle = '#d8f6f8';
    context.font =
      '700 50px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(
      label,
      this.canvas.width / 2,
      this.canvas.height / 2 + 1,
      432,
    );

    this.texture.needsUpdate = true;
  }
}
