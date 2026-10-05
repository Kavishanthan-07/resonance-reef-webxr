import {
  AnimationMixer,
  CatmullRomCurve3,
  Group,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Object3D,
} from '@iwsdk/core';

export type FinaleState =
  | 'idle'
  | 'entering'
  | 'crossing'
  | 'exiting'
  | 'complete';

export interface MantaFinaleConfig {
  animationSpeed: number;
  durationSeconds: number;
  headingOffsetY: number;
  scale: number;
}

export interface MantaFinaleAsset {
  animations: readonly AnimationClip[];
  visual: Object3D;
}

export const MANTA_FINALE_DEFAULTS: MantaFinaleConfig = {
  animationSpeed: 0.85,
  durationSeconds: 18,
  headingOffsetY: 0,
  scale: 0.22,
};

export const MANTA_FINALE_POINTS = {
  end: new Vector3(-6.5, 2.6, -7.0),
  mid: new Vector3(0.3, 2.8, -4.6),
  start: new Vector3(6.0, 2.3, -5.7),
} as const;

const TANGENT_LOOK_AHEAD = 0.02;

function selectMantaAnimation(
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

function setNoShadows(object: Object3D): void {
  object.traverse((child) => {
    child.castShadow = false;
    child.receiveShadow = false;
  });
}

export class MantaFinale {
  readonly root = new Group();

  readonly config: MantaFinaleConfig;

  private readonly curve = new CatmullRomCurve3([
    MANTA_FINALE_POINTS.start,
    MANTA_FINALE_POINTS.mid,
    MANTA_FINALE_POINTS.end,
  ]);
  private readonly lookPoint = new Vector3();

  private state: FinaleState = 'idle';
  private visual: Object3D | null = null;
  private mixer: AnimationMixer | null = null;
  private action: AnimationAction | null = null;
  private elapsedSeconds = 0;
  private startRequested = false;

  constructor(config: Partial<MantaFinaleConfig> = {}) {
    this.config = {
      ...MANTA_FINALE_DEFAULTS,
      ...config,
    };

    this.root.name = 'ResonanceReefMantaFinale';
    this.root.visible = false;
    this.root.position.copy(MANTA_FINALE_POINTS.start);
  }

  get currentState(): FinaleState {
    return this.state;
  }

  get isComplete(): boolean {
    return this.state === 'complete';
  }

  setAsset(asset: MantaFinaleAsset): {
    animationNames: string[];
    selectedAnimation: string | null;
  } {
    this.visual?.removeFromParent();

    this.visual = asset.visual;
    this.visual.scale.setScalar(this.config.scale);
    setNoShadows(this.visual);
    this.root.add(this.visual);

    this.mixer = null;
    this.action = null;

    const selectedAnimation =
      selectMantaAnimation(asset.animations);

    if (selectedAnimation != null) {
      this.mixer =
        new AnimationMixer(this.visual);
      this.action =
        this.mixer.clipAction(selectedAnimation);
      this.action.timeScale =
        this.config.animationSpeed;
      this.action.play();
      this.action.paused = true;
    }

    const shouldStart =
      this.startRequested;

    this.reset();

    if (shouldStart) {
      this.start();
    }

    return {
      animationNames: asset.animations.map((clip) => clip.name),
      selectedAnimation:
        selectedAnimation?.name ?? null,
    };
  }

  start(): void {
    if (this.state !== 'idle') {
      return;
    }

    if (this.visual == null) {
      this.startRequested = true;
      return;
    }

    this.startRequested = false;
    this.elapsedSeconds = 0;
    this.state = 'entering';
    this.root.visible = true;
    this.root.position.copy(MANTA_FINALE_POINTS.start);

    if (this.action != null) {
      this.action.reset();
      this.action.paused = false;
      this.action.play();
    }
  }

  update(deltaSeconds: number): void {
    if (
      this.state === 'idle' ||
      this.state === 'complete'
    ) {
      return;
    }

    this.elapsedSeconds += Math.max(0, deltaSeconds);
    const progress = Math.min(
      1,
      this.elapsedSeconds / this.config.durationSeconds,
    );

    this.root.position.copy(
      this.curve.getPoint(progress),
    );
    this.lookPoint.copy(
      this.curve.getPoint(
        Math.min(1, progress + TANGENT_LOOK_AHEAD),
      ),
    );
    this.root.lookAt(this.lookPoint);
    this.root.rotation.y += this.config.headingOffsetY;

    if (progress < 0.22) {
      this.state = 'entering';
    } else if (progress < 0.82) {
      this.state = 'crossing';
    } else if (progress < 1) {
      this.state = 'exiting';
    } else {
      this.complete();
    }

    this.mixer?.update(deltaSeconds);
  }

  reset(): void {
    this.elapsedSeconds = 0;
    this.startRequested = false;
    this.state = 'idle';
    this.root.visible = false;
    this.root.position.copy(MANTA_FINALE_POINTS.start);

    if (this.action != null) {
      this.action.stop();
      this.action.paused = true;
    }
  }

  private complete(): void {
    this.state = 'complete';
    this.root.visible = false;

    if (this.action != null) {
      this.action.stop();
      this.action.paused = true;
    }
  }
}
