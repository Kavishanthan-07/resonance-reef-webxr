import {
  AnimationClip,
  AnimationMixer,
  Group,
  Object3D,
  Vector3,
} from '@iwsdk/core';

export interface FishAgentConfig {
  headingOffsetY: number;
  modelScale: number;
  phaseOffset: number;
  outwardBias: Vector3;
  root: Group;
  swimClip: AnimationClip | null;
  visual: Object3D;
}

export class FishAgent {
  readonly root: Group;
  readonly visual: Object3D;
  readonly velocity = new Vector3();
  readonly phaseOffset: number;
  readonly outwardBias: Vector3;
  readonly headingOffsetY: number;

  private readonly mixer: AnimationMixer | null;

  constructor(config: FishAgentConfig) {
    this.root = config.root;
    this.visual = config.visual;
    this.phaseOffset = config.phaseOffset;
    this.outwardBias = config.outwardBias;
    this.headingOffsetY = config.headingOffsetY;

    this.visual.scale.setScalar(config.modelScale);
    this.root.add(this.visual);

    this.mixer =
      config.swimClip == null
        ? null
        : new AnimationMixer(this.visual);

    if (this.mixer != null && config.swimClip != null) {
      const action = this.mixer.clipAction(config.swimClip);

      action.timeScale = 0.9 + Math.random() * 0.2;
      action.play();
    }
  }

  updateAnimation(deltaSeconds: number): void {
    this.mixer?.update(deltaSeconds);
  }
}
