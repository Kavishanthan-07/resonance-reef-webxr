import {
  CanvasTexture,
  Color,
  Group,
  LinearFilter,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  type World,
  Vector3,
} from '@iwsdk/core';

type Handedness = 'left' | 'right';
type HandSource =
  | 'xr-hand'
  | 'xr-index-fallback'
  | 'desktop-simulated';
type DesktopFishMode = 'look' | 'interact';

interface XRSessionWithTrackedSources extends XRSession {
  readonly trackedSources?: XRInputSourceArray;
}

export interface FishHandTarget {
  active: boolean;
  handedness: Handedness;
  indexTip: Vector3;
  pinchStrength: number;
  pinching: boolean;
  source: HandSource;
  thumbTip: Vector3;
}

export interface FishHandInteractionSnapshot {
  demoEnabled: boolean;
  left: FishHandTarget;
  right: FishHandTarget;
  viewerPosition: Vector3;
}

const INDEX_TIP_JOINT: XRHandJoint = 'index-finger-tip';
const THUMB_TIP_JOINT: XRHandJoint = 'thumb-tip';
const PINCH_OPEN_DISTANCE = 0.052;
const PINCH_CLOSED_DISTANCE = 0.018;
const DESKTOP_DEFAULT_DEPTH = 4.35;
const DESKTOP_MIN_DEPTH = 2.35;
const DESKTOP_MAX_DEPTH = 7.2;
const LOOK_SENSITIVITY = 0.0042;
const CAMERA_PITCH_LIMIT = MathUtils.degToRad(52);
const XR_HINT_VISIBLE_SECONDS = 9;
const XR_HINT_FADE_SECONDS = 3;
const INSTRUCTION_STORAGE_KEY =
  'resonance-reef-desktop-interaction-intro-dismissed';

function createHandTarget(
  handedness: Handedness,
): FishHandTarget {
  return {
    active: false,
    handedness,
    indexTip: new Vector3(),
    pinchStrength: 0,
    pinching: false,
    source: 'xr-index-fallback',
    thumbTip: new Vector3(),
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function createDebugLabelTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  canvas.width = 512;
  canvas.height = 192;

  if (context != null) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(4, 22, 28, 0.72)';
    context.strokeStyle = 'rgba(141, 221, 231, 0.62)';
    context.lineWidth = 5;
    context.beginPath();
    context.roundRect(18, 18, 476, 156, 20);
    context.fill();
    context.stroke();
    context.fillStyle = '#e8fdff';
    context.font =
      '800 34px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('SIMULATED HAND', 256, 72, 430);
    context.font =
      '600 20px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.fillStyle = 'rgba(232, 253, 255, 0.78)';
    context.fillText(
      'mouse move / wheel depth / hold press pinch',
      256,
      118,
      430,
    );
  }

  const texture = new CanvasTexture(canvas);

  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;

  return texture;
}

function createXRHintTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  canvas.width = 768;
  canvas.height = 256;

  if (context != null) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(3, 21, 29, 0.5)';
    context.strokeStyle = 'rgba(141, 221, 231, 0.24)';
    context.lineWidth = 6;
    context.beginPath();
    context.roundRect(34, 34, 700, 188, 28);
    context.fill();
    context.stroke();
    context.shadowColor = 'rgba(0, 5, 9, 0.88)';
    context.shadowBlur = 14;
    context.fillStyle = '#e3fbff';
    context.font =
      '700 34px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('Open hand invites curious fish', 384, 96, 650);
    context.font =
      '600 26px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.fillStyle = 'rgba(227, 251, 255, 0.82)';
    context.fillText('Pinch gently and they drift away', 384, 150, 650);
  }

  const texture = new CanvasTexture(canvas);

  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;

  return texture;
}

function shouldIgnorePointerTarget(
  event: Event,
): boolean {
  const target = event.target;

  return (
    target instanceof Element &&
    target.closest(
      '.resonance-reef-controls, .rr-fish-mode-panel, .rr-fish-intro-card',
    ) != null
  );
}

function storageSaysIntroDismissed(): boolean {
  try {
    return (
      window.localStorage.getItem(INSTRUCTION_STORAGE_KEY) === '1'
    );
  } catch {
    return false;
  }
}

function rememberIntroDismissed(): void {
  try {
    window.localStorage.setItem(INSTRUCTION_STORAGE_KEY, '1');
  } catch {
    // Browsers can disable storage; dismissal still works for this page.
  }
}

export class HandFishInteractor {
  readonly root = new Group();
  readonly snapshot: FishHandInteractionSnapshot = {
    demoEnabled: false,
    left: createHandTarget('left'),
    right: createHandTarget('right'),
    viewerPosition: new Vector3(0, 1.6, 0),
  };

  private readonly desktopTarget = this.snapshot.right;
  private readonly desktopGroup = new Group();
  private readonly desktopMaterial = new MeshBasicMaterial({
    color: 0x8ee4df,
    fog: true,
    transparent: true,
    opacity: 0.54,
  });
  private readonly desktopSphereGeometry =
    new SphereGeometry(0.05, 16, 10);
  private readonly debugLabelTexture = createDebugLabelTexture();
  private readonly debugLabelMaterial = new MeshBasicMaterial({
    color: 0xffffff,
    depthWrite: false,
    map: this.debugLabelTexture,
    transparent: true,
  });
  private readonly debugLabelGeometry =
    new PlaneGeometry(0.9, 0.34);
  private readonly xrHintTexture = createXRHintTexture();
  private readonly xrHintMaterial = new MeshBasicMaterial({
    color: 0xffffff,
    depthWrite: false,
    map: this.xrHintTexture,
    opacity: 0,
    transparent: true,
  });
  private readonly xrHintGeometry =
    new PlaneGeometry(1.18, 0.4);
  private readonly xrHintMesh = new Mesh(
    this.xrHintGeometry,
    this.xrHintMaterial,
  );
  private readonly worldPosition = new Vector3();
  private readonly worldIndex = new Vector3();
  private readonly cameraForward = new Vector3();
  private readonly cameraRight = new Vector3();
  private readonly cameraUp = new Vector3();
  private readonly cameraQuaternion = new Quaternion();
  private readonly mouseNdc = {
    x: 0.62,
    y: 0.48,
  };
  private readonly targetColor = new Color();

  private desktopMode: DesktopFishMode;
  private desktopDepth = DESKTOP_DEFAULT_DEPTH;
  private desktopPinching = false;
  private lookDragging = false;
  private cameraControlInitialized = false;
  private cameraPitch = 0;
  private cameraYaw = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private disposed = false;
  private xrHintElapsed = 0;

  private modePanel: HTMLElement | null = null;
  private introCard: HTMLElement | null = null;
  private modeLabel: HTMLElement | null = null;
  private lookButton: HTMLButtonElement | null = null;
  private interactButton: HTMLButtonElement | null = null;

  constructor(
    private readonly world: World,
    private readonly debugDemoEnabled: boolean,
  ) {
    this.desktopMode = debugDemoEnabled
      ? 'interact'
      : 'look';
    this.root.name = 'ResonanceReefHandFishInteractor';
    this.snapshot.demoEnabled = debugDemoEnabled;

    this.installDesktopVisual();
    this.installXRHint();
    this.installDesktopControls();
    this.installDesktopUi();
  }

  update(
    deltaSeconds: number,
    timeSeconds: number,
  ): FishHandInteractionSnapshot {
    const xrActive = this.world.xrSession != null;

    this.snapshot.viewerPosition.copy(
      this.world.camera.getWorldPosition(this.worldPosition),
    );
    this.resetTarget(this.snapshot.left);
    this.resetTarget(this.snapshot.right);
    this.sampleTrackedHands();

    if (!xrActive) {
      this.updateDesktopTarget(timeSeconds);
      this.updateDesktopVisual(deltaSeconds);
    } else {
      this.desktopGroup.visible = false;
      this.desktopPinching = false;
    }

    this.updateDesktopUi(xrActive);
    this.updateXRHint(deltaSeconds, xrActive);

    return this.snapshot;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
    window.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('keydown', this.handleKeyDown);
    this.modePanel?.remove();
    this.introCard?.remove();
    this.desktopSphereGeometry.dispose();
    this.desktopMaterial.dispose();
    this.debugLabelGeometry.dispose();
    this.debugLabelMaterial.dispose();
    this.debugLabelTexture.dispose();
    this.xrHintGeometry.dispose();
    this.xrHintMaterial.dispose();
    this.xrHintTexture.dispose();
    this.root.removeFromParent();
  }

  private installDesktopVisual(): void {
    const sphere = new Mesh(
      this.desktopSphereGeometry,
      this.desktopMaterial,
    );

    sphere.name = 'ResonanceReefDesktopHandTarget';
    this.desktopGroup.name = 'ResonanceReefDesktopHand';
    this.desktopGroup.visible = false;
    this.desktopGroup.add(sphere);

    if (this.debugDemoEnabled) {
      const label = new Mesh(
        this.debugLabelGeometry,
        this.debugLabelMaterial,
      );

      label.name = 'ResonanceReefSimulatedHandDebugLabel';
      label.position.set(0, 0.2, 0);
      this.desktopGroup.add(label);
    }

    this.root.add(this.desktopGroup);
  }

  private installXRHint(): void {
    this.xrHintMesh.name =
      'ResonanceReefXRHandInteractionHint';
    this.xrHintMesh.position.set(0, 2.08, -2.58);
    this.xrHintMesh.visible = false;
    this.root.add(this.xrHintMesh);
  }

  private installDesktopControls(): void {
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
    window.addEventListener('wheel', this.handleWheel, {
      passive: false,
    });
    window.addEventListener('keydown', this.handleKeyDown);
  }

  private installDesktopUi(): void {
    this.installDesktopStyles();

    const introDismissed = storageSaysIntroDismissed();
    const panel = document.createElement('section');
    const modeText = document.createElement('div');
    const buttons = document.createElement('div');
    const lookButton = document.createElement('button');
    const interactButton = document.createElement('button');

    panel.className = 'rr-fish-mode-panel';
    panel.setAttribute('aria-label', 'Desktop interaction mode');
    modeText.className = 'rr-fish-mode-label';
    buttons.className = 'rr-fish-mode-buttons';
    lookButton.type = 'button';
    interactButton.type = 'button';
    lookButton.textContent = 'Look Around';
    interactButton.textContent = 'Interact With Fish';
    lookButton.addEventListener('click', () => {
      this.setDesktopMode('look');
    });
    interactButton.addEventListener('click', () => {
      this.setDesktopMode('interact');
    });

    buttons.append(lookButton, interactButton);
    panel.append(modeText, buttons);
    document.body.append(panel);

    this.modePanel = panel;
    this.modeLabel = modeText;
    this.lookButton = lookButton;
    this.interactButton = interactButton;

    if (!introDismissed) {
      const card = document.createElement('aside');
      const title = document.createElement('div');
      const body = document.createElement('div');
      const dismiss = document.createElement('button');

      card.className = 'rr-fish-intro-card';
      card.setAttribute('aria-label', 'Desktop interaction instructions');
      title.className = 'rr-fish-intro-title';
      body.className = 'rr-fish-intro-body';
      dismiss.className = 'rr-fish-intro-dismiss';
      dismiss.type = 'button';
      title.textContent = 'Explore the reef';
      body.textContent =
        'Look Around lets you drag to turn in place. Interact With Fish turns the mouse into a gentle hand target; hold the mouse button to pinch.';
      dismiss.textContent = 'Got it';
      dismiss.addEventListener('click', () => {
        rememberIntroDismissed();
        card.remove();
        this.introCard = null;
      });

      card.append(title, body, dismiss);
      document.body.append(card);
      this.introCard = card;
    }

    this.updateModeUi();
  }

  private installDesktopStyles(): void {
    if (document.getElementById('resonance-reef-fish-interaction-style')) {
      return;
    }

    const style = document.createElement('style');

    style.id = 'resonance-reef-fish-interaction-style';
    style.textContent = `
      .rr-fish-mode-panel,
      .rr-fish-intro-card {
        position: fixed;
        z-index: 11;
        box-sizing: border-box;
        border: 1px solid rgba(141, 221, 231, 0.26);
        border-radius: 8px;
        background: rgba(4, 20, 28, 0.76);
        color: #e9fbff;
        font: 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        backdrop-filter: blur(10px);
      }

      .rr-fish-mode-panel {
        right: 16px;
        bottom: 16px;
        width: min(360px, calc(100vw - 32px));
        padding: 10px;
      }

      .rr-fish-mode-label {
        margin-bottom: 8px;
        color: rgba(233, 251, 255, 0.82);
        font-weight: 700;
      }

      .rr-fish-mode-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .rr-fish-mode-buttons button,
      .rr-fish-intro-dismiss {
        min-height: 32px;
        border: 1px solid rgba(141, 221, 231, 0.36);
        border-radius: 6px;
        background: rgba(12, 57, 68, 0.84);
        color: #e9fbff;
        cursor: pointer;
        font: inherit;
        font-weight: 700;
        padding: 6px 10px;
      }

      .rr-fish-mode-buttons button[aria-pressed="true"] {
        background: rgba(64, 178, 184, 0.92);
        color: #052029;
      }

      .rr-fish-mode-buttons button:hover,
      .rr-fish-mode-buttons button:focus-visible,
      .rr-fish-intro-dismiss:hover,
      .rr-fish-intro-dismiss:focus-visible {
        outline: 2px solid rgba(141, 221, 231, 0.52);
        outline-offset: 1px;
      }

      .rr-fish-intro-card {
        right: 16px;
        top: 16px;
        width: min(320px, calc(100vw - 32px));
        padding: 12px;
      }

      .rr-fish-intro-title {
        color: #8ddde7;
        font-weight: 800;
        margin-bottom: 6px;
      }

      .rr-fish-intro-body {
        color: rgba(233, 251, 255, 0.84);
        margin-bottom: 10px;
      }

      .rr-fish-intro-dismiss {
        background: rgba(64, 178, 184, 0.9);
        color: #052029;
      }

      body.rr-look-mode {
        cursor: grab;
      }

      body.rr-look-mode.rr-look-dragging {
        cursor: grabbing;
      }

      body.rr-fish-interact-mode {
        cursor: crosshair;
      }

      @media (max-width: 680px) {
        .rr-fish-intro-card {
          top: auto;
          bottom: 118px;
        }
      }
    `;
    document.head.append(style);
  }

  private setDesktopMode(mode: DesktopFishMode): void {
    if (this.desktopMode === mode) {
      return;
    }

    this.desktopMode = mode;
    this.desktopPinching = false;
    this.lookDragging = false;
    this.updateModeUi();
  }

  private updateModeUi(): void {
    this.modeLabel!.textContent =
      this.desktopMode === 'look'
        ? 'Mode: Look Around'
        : 'Mode: Interact With Fish';
    this.lookButton!.setAttribute(
      'aria-pressed',
      this.desktopMode === 'look' ? 'true' : 'false',
    );
    this.interactButton!.setAttribute(
      'aria-pressed',
      this.desktopMode === 'interact' ? 'true' : 'false',
    );
    document.body.classList.toggle(
      'rr-look-mode',
      this.desktopMode === 'look',
    );
    document.body.classList.toggle(
      'rr-fish-interact-mode',
      this.desktopMode === 'interact',
    );
    document.body.classList.toggle(
      'rr-look-dragging',
      this.lookDragging,
    );
  }

  private updateDesktopUi(xrActive: boolean): void {
    const visible = !xrActive;

    if (this.modePanel != null) {
      this.modePanel.hidden = !visible;
    }

    if (this.introCard != null) {
      this.introCard.hidden = !visible;
    }
  }

  private readonly handlePointerMove = (
    event: PointerEvent,
  ): void => {
    this.mouseNdc.x =
      window.innerWidth > 0
        ? event.clientX / window.innerWidth
        : 0.5;
    this.mouseNdc.y =
      window.innerHeight > 0
        ? event.clientY / window.innerHeight
        : 0.5;

    if (
      this.desktopMode !== 'look' ||
      !this.lookDragging ||
      this.world.xrSession != null
    ) {
      return;
    }

    const deltaX = event.clientX - this.lastPointerX;
    const deltaY = event.clientY - this.lastPointerY;

    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.initializeCameraControl();
    this.cameraYaw -= deltaX * LOOK_SENSITIVITY;
    this.cameraPitch = MathUtils.clamp(
      this.cameraPitch - deltaY * LOOK_SENSITIVITY,
      -CAMERA_PITCH_LIMIT,
      CAMERA_PITCH_LIMIT,
    );
    this.applyCameraLook();
  };

  private readonly handlePointerDown = (
    event: PointerEvent,
  ): void => {
    if (
      shouldIgnorePointerTarget(event) ||
      event.button !== 0 ||
      this.world.xrSession != null
    ) {
      return;
    }

    if (this.desktopMode === 'look') {
      this.lookDragging = true;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      this.initializeCameraControl();
      this.updateModeUi();
      return;
    }

    this.desktopPinching = true;
  };

  private readonly handlePointerUp = (): void => {
    this.desktopPinching = false;

    if (this.lookDragging) {
      this.lookDragging = false;
      this.updateModeUi();
    }
  };

  private readonly handleWheel = (
    event: WheelEvent,
  ): void => {
    if (
      this.desktopMode !== 'interact' ||
      this.world.xrSession != null ||
      shouldIgnorePointerTarget(event)
    ) {
      return;
    }

    event.preventDefault();
    this.desktopDepth = MathUtils.clamp(
      this.desktopDepth + event.deltaY * 0.0024,
      DESKTOP_MIN_DEPTH,
      DESKTOP_MAX_DEPTH,
    );
  };

  private readonly handleKeyDown = (
    event: KeyboardEvent,
  ): void => {
    if (
      this.desktopMode !== 'interact' ||
      this.world.xrSession != null ||
      shouldIgnorePointerTarget(event)
    ) {
      return;
    }

    if (event.key === '[' || event.key.toLowerCase() === 'q') {
      this.desktopDepth = MathUtils.clamp(
        this.desktopDepth + 0.18,
        DESKTOP_MIN_DEPTH,
        DESKTOP_MAX_DEPTH,
      );
    } else if (event.key === ']' || event.key.toLowerCase() === 'e') {
      this.desktopDepth = MathUtils.clamp(
        this.desktopDepth - 0.18,
        DESKTOP_MIN_DEPTH,
        DESKTOP_MAX_DEPTH,
      );
    }
  };

  private initializeCameraControl(): void {
    if (this.cameraControlInitialized) {
      return;
    }

    this.cameraControlInitialized = true;
    this.cameraPitch = this.world.camera.rotation.x;
    this.cameraYaw = this.world.camera.rotation.y;
    this.world.camera.rotation.order = 'YXZ';
  }

  private applyCameraLook(): void {
    this.world.camera.rotation.set(
      this.cameraPitch,
      this.cameraYaw,
      0,
      'YXZ',
    );
  }

  private resetTarget(target: FishHandTarget): void {
    target.active = false;
    target.pinchStrength = 0;
    target.pinching = false;
  }

  private sampleTrackedHands(): void {
    const session = this.world.xrSession;
    const frame = this.world.xrFrame;
    const referenceSpace = this.world.xrReferenceSpace;

    if (
      session == null ||
      frame == null ||
      referenceSpace == null
    ) {
      this.sampleIndexFallback('left');
      this.sampleIndexFallback('right');
      return;
    }

    this.sampleInputSources(session.inputSources, frame, referenceSpace);

    const trackedSources =
      (session as XRSessionWithTrackedSources).trackedSources;

    if (trackedSources != null) {
      this.sampleInputSources(trackedSources, frame, referenceSpace);
    }

    this.sampleIndexFallback('left');
    this.sampleIndexFallback('right');
  }

  private sampleInputSources(
    inputSources: XRInputSourceArray,
    frame: XRFrame,
    referenceSpace: XRReferenceSpace,
  ): void {
    for (const inputSource of inputSources) {
      if (
        inputSource.handedness !== 'left' &&
        inputSource.handedness !== 'right'
      ) {
        continue;
      }

      const target = this.snapshot[inputSource.handedness];

      if (target.active || inputSource.hand == null) {
        continue;
      }

      const indexSpace = inputSource.hand.get(INDEX_TIP_JOINT);
      const thumbSpace = inputSource.hand.get(THUMB_TIP_JOINT);

      if (indexSpace == null || thumbSpace == null) {
        continue;
      }

      const indexPose = frame.getPose(indexSpace, referenceSpace);
      const thumbPose = frame.getPose(thumbSpace, referenceSpace);

      if (indexPose == null || thumbPose == null) {
        continue;
      }

      target.indexTip.set(
        indexPose.transform.position.x,
        indexPose.transform.position.y,
        indexPose.transform.position.z,
      );
      target.thumbTip.set(
        thumbPose.transform.position.x,
        thumbPose.transform.position.y,
        thumbPose.transform.position.z,
      );
      this.world.player.localToWorld(target.indexTip);
      this.world.player.localToWorld(target.thumbTip);
      this.setPinchFromDistance(target);
      target.active = true;
      target.source = 'xr-hand';
    }
  }

  private sampleIndexFallback(
    handedness: Handedness,
  ): void {
    const target = this.snapshot[handedness];
    const handAdapter =
      this.world.input.xr.visualAdapters.hand[handedness];

    if (
      target.active ||
      !handAdapter.connected ||
      !handAdapter.isPrimary
    ) {
      return;
    }

    this.world.player.indexTipSpaces[handedness]
      .getWorldPosition(target.indexTip);
    target.thumbTip.copy(target.indexTip);
    target.pinchStrength = handAdapter.getPinchStrength();
    target.pinching = target.pinchStrength > 0.72;
    target.active = true;
    target.source = 'xr-index-fallback';
  }

  private setPinchFromDistance(
    target: FishHandTarget,
  ): void {
    const pinchDistance =
      target.indexTip.distanceTo(target.thumbTip);
    const span =
      PINCH_OPEN_DISTANCE - PINCH_CLOSED_DISTANCE;

    target.pinchStrength =
      span <= 0
        ? pinchDistance <= PINCH_CLOSED_DISTANCE
          ? 1
          : 0
        : clamp01(
            (PINCH_OPEN_DISTANCE - pinchDistance) / span,
          );
    target.pinching = target.pinchStrength > 0.76;
  }

  private updateDesktopTarget(timeSeconds: number): void {
    if (this.desktopMode !== 'interact') {
      return;
    }

    this.world.camera.getWorldPosition(this.worldPosition);
    this.world.camera.getWorldDirection(this.cameraForward);
    this.world.camera.getWorldQuaternion(this.cameraQuaternion);
    this.cameraRight
      .set(1, 0, 0)
      .applyQuaternion(this.cameraQuaternion);
    this.cameraUp
      .set(0, 1, 0)
      .applyQuaternion(this.cameraQuaternion);

    const verticalSpan =
      Math.tan(MathUtils.degToRad(this.world.camera.fov) * 0.5) *
      this.desktopDepth *
      2;
    const horizontalSpan =
      verticalSpan *
      (window.innerWidth / Math.max(1, window.innerHeight));
    const x =
      (this.mouseNdc.x - 0.5) * horizontalSpan * 0.86;
    const y =
      (0.5 - this.mouseNdc.y) * verticalSpan * 0.86;

    this.desktopTarget.indexTip
      .copy(this.worldPosition)
      .addScaledVector(this.cameraForward, this.desktopDepth)
      .addScaledVector(this.cameraRight, x)
      .addScaledVector(this.cameraUp, y);
    this.desktopTarget.indexTip.y +=
      Math.sin(timeSeconds * 0.8) * 0.035;
    this.desktopTarget.thumbTip.copy(this.desktopTarget.indexTip);
    this.desktopTarget.thumbTip.addScaledVector(
      this.cameraRight,
      this.desktopPinching ? 0.016 : 0.085,
    );
    this.desktopTarget.thumbTip.addScaledVector(
      this.cameraUp,
      this.desktopPinching ? -0.01 : -0.03,
    );
    this.desktopTarget.active = true;
    this.desktopTarget.pinching = this.desktopPinching;
    this.desktopTarget.pinchStrength =
      this.desktopPinching ? 1 : 0;
    this.desktopTarget.source = 'desktop-simulated';
  }

  private updateDesktopVisual(deltaSeconds: number): void {
    const active =
      this.desktopMode === 'interact' &&
      this.desktopTarget.active;

    this.desktopGroup.visible = active;

    if (!active) {
      return;
    }

    const damping =
      1 - Math.exp(-Math.min(deltaSeconds, 0.05) * 8);

    this.desktopGroup.position.lerp(
      this.desktopTarget.indexTip,
      damping,
    );
    this.targetColor
      .set(this.desktopPinching ? 0xf0c982 : 0x8ee4df);
    this.desktopMaterial.color.lerp(this.targetColor, damping);
    this.desktopMaterial.opacity =
      this.desktopPinching ? 0.76 : 0.54;
    this.desktopGroup.scale.setScalar(
      this.desktopPinching ? 1.14 : 1,
    );
    this.desktopGroup.lookAt(
      this.world.camera.getWorldPosition(this.worldIndex),
    );
  }

  private updateXRHint(
    deltaSeconds: number,
    xrActive: boolean,
  ): void {
    if (!xrActive) {
      this.xrHintElapsed = 0;
      this.xrHintMesh.visible = false;
      this.xrHintMaterial.opacity = 0;
      return;
    }

    this.xrHintElapsed += Math.max(0, deltaSeconds);

    const fadeStart = XR_HINT_VISIBLE_SECONDS;
    const fadeEnd =
      XR_HINT_VISIBLE_SECONDS + XR_HINT_FADE_SECONDS;
    const opacity =
      this.xrHintElapsed <= fadeStart
        ? 0.72
        : this.xrHintElapsed >= fadeEnd
          ? 0
          : 0.72 *
            (1 -
              (this.xrHintElapsed - fadeStart) /
                XR_HINT_FADE_SECONDS);

    this.xrHintMaterial.opacity = opacity;
    this.xrHintMesh.visible = opacity > 0.01;

    if (this.xrHintMesh.visible) {
      this.xrHintMesh.lookAt(
        this.world.camera.getWorldPosition(this.worldIndex),
      );
    }
  }
}
