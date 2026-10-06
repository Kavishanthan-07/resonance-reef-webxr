import {
  CanvasTexture,
  Group,
  Hovered,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Pressed,
  RayInteractable,
  type Entity,
  type World,
} from '@iwsdk/core';

import { READY_SCREEN_INSTRUCTION } from './BreathGuidance.js';
import { ExperienceController } from './ExperienceController.js';

type XRButtonAction = () => void;

class XRButton {
  readonly root = new Group();
  readonly entity: Entity;

  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private readonly material: MeshBasicMaterial;
  private readonly geometry: PlaneGeometry;
  private readonly mesh: Mesh;
  private previousPressed = false;
  private label = '';

  constructor(
    world: World,
    label: string,
    private readonly action: XRButtonAction,
    width = 0.72,
  ) {
    this.root.name = `ResonanceReefXRButton-${label}`;
    this.canvas.width = 512;
    this.canvas.height = 160;

    this.texture = new CanvasTexture(this.canvas);
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;

    this.material = new MeshBasicMaterial({
      color: 0xffffff,
      map: this.texture,
      transparent: true,
    });
    this.geometry = new PlaneGeometry(width, 0.22);
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.name = `${this.root.name}-Surface`;
    this.root.add(this.mesh);

    this.entity = world.createTransformEntity(this.root);
    this.entity.addComponent(RayInteractable);
    this.setLabel(label);
  }

  setLabel(label: string): void {
    if (label === this.label) {
      return;
    }

    this.label = label;
    this.drawTexture(false, false);
  }

  update(active: boolean): void {
    this.root.visible = active;

    if (!active) {
      this.previousPressed = false;
      return;
    }

    const hovered = this.entity.hasComponent(Hovered);
    const pressed = this.entity.hasComponent(Pressed);

    this.drawTexture(hovered, pressed);
    this.root.scale.setScalar(pressed ? 0.96 : 1);

    if (pressed && !this.previousPressed) {
      this.action();
    }

    this.previousPressed = pressed;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }

  private drawTexture(
    hovered: boolean,
    pressed: boolean,
  ): void {
    const context = this.canvas.getContext('2d');

    if (context == null) {
      return;
    }

    const background = pressed
      ? '#54d7d0'
      : hovered
        ? '#287986'
        : '#0a3b47';
    const border = hovered
      ? '#b7faff'
      : '#6ed4df';
    const text = pressed ? '#04242b' : '#ecfdff';

    context.clearRect(
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );
    context.fillStyle = background;
    context.strokeStyle = border;
    context.lineWidth = 8;
    context.beginPath();
    context.roundRect(18, 18, 476, 124, 22);
    context.fill();
    context.stroke();
    context.fillStyle = text;
    context.font =
      '700 42px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(
      this.label,
      this.canvas.width / 2,
      this.canvas.height / 2,
      430,
    );

    this.texture.needsUpdate = true;
  }
}

class XRReadyInstruction {
  readonly root = new Group();

  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private readonly material: MeshBasicMaterial;
  private readonly geometry: PlaneGeometry;

  constructor() {
    this.root.name =
      'ResonanceReefXRReadyInstruction';
    this.canvas.width = 720;
    this.canvas.height = 280;

    this.texture = new CanvasTexture(this.canvas);
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;

    this.material = new MeshBasicMaterial({
      color: 0xffffff,
      depthWrite: false,
      map: this.texture,
      transparent: true,
    });
    this.geometry = new PlaneGeometry(1.48, 0.56);

    const mesh = new Mesh(
      this.geometry,
      this.material,
    );

    mesh.name =
      'ResonanceReefXRReadyInstruction-Surface';
    this.root.add(mesh);
    this.drawTexture();
  }

  update(active: boolean): void {
    this.root.visible = active;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }

  private drawTexture(): void {
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
    context.fillStyle = 'rgba(2, 18, 26, 0.58)';
    context.strokeStyle = 'rgba(141, 221, 231, 0.22)';
    context.lineWidth = 6;
    context.beginPath();
    context.roundRect(28, 28, 664, 224, 28);
    context.fill();
    context.stroke();

    context.shadowColor = 'rgba(0, 5, 9, 0.85)';
    context.shadowBlur = 12;
    context.fillStyle = '#e2f8fa';
    context.font =
      '600 34px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    READY_SCREEN_INSTRUCTION
      .split('\n')
      .forEach((line, index) => {
        context.fillText(
          line,
          this.canvas.width / 2,
          90 + index * 52,
          620,
        );
      });

    this.texture.needsUpdate = true;
  }
}

export class ExperienceXRControls {
  readonly root = new Group();

  private readonly readyInstruction =
    new XRReadyInstruction();
  private readonly startButton: XRButton;
  private readonly resumeButton: XRButton;
  private readonly restartButton: XRButton;
  private readonly againButton: XRButton;
  private readonly muteButton: XRButton;

  constructor(
    world: World,
    private readonly controller: ExperienceController,
  ) {
    this.root.name = 'ResonanceReefXRControls';
    this.root.position.set(0, 1.45, -2.15);

    world.createTransformEntity(this.root);

    this.startButton = new XRButton(
      world,
      'START',
      () => this.controller.start(),
      0.8,
    );
    this.resumeButton = new XRButton(
      world,
      'RESUME',
      () => this.controller.resume(),
    );
    this.restartButton = new XRButton(
      world,
      'RESTART',
      () => this.controller.restart(),
    );
    this.againButton = new XRButton(
      world,
      'BREATHE AGAIN',
      () => this.controller.restart(),
      1.0,
    );
    this.muteButton = new XRButton(
      world,
      'MUTE',
      () => this.controller.toggleMuted(),
      0.62,
    );

    this.root.add(
      this.readyInstruction.root,
      this.startButton.root,
      this.resumeButton.root,
      this.restartButton.root,
      this.againButton.root,
      this.muteButton.root,
    );

    this.layoutReady();
  }

  update(): void {
    const { muted, phase } =
      this.controller.getState();

    this.root.visible = phase !== 'running';
    this.muteButton.setLabel(muted ? 'UNMUTE' : 'MUTE');

    this.readyInstruction.update(phase === 'ready');
    this.startButton.update(phase === 'ready');
    this.resumeButton.update(phase === 'paused');
    this.restartButton.update(phase === 'paused');
    this.againButton.update(phase === 'complete');
    this.muteButton.update(phase !== 'running');
  }

  dispose(): void {
    this.readyInstruction.dispose();
    this.startButton.dispose();
    this.resumeButton.dispose();
    this.restartButton.dispose();
    this.againButton.dispose();
    this.muteButton.dispose();
  }

  private layoutReady(): void {
    this.readyInstruction.root.position.set(0, 0.62, 0);
    this.startButton.root.position.set(0, 0.14, 0);
    this.resumeButton.root.position.set(-0.39, 0.14, 0);
    this.restartButton.root.position.set(0.39, 0.14, 0);
    this.againButton.root.position.set(0, 0.14, 0);
    this.muteButton.root.position.set(0, -0.15, 0);
  }
}
