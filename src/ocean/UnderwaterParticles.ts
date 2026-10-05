import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
} from '@iwsdk/core';

interface ParticleFieldConfig {
  count: number;
  xRange: [number, number];
  yRange: [number, number];
  zRange: [number, number];
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class UnderwaterParticles {
  readonly points: Points;

  readonly count: number;

  private readonly positions: Float32Array;
  private readonly driftSpeeds: Float32Array;
  private readonly phaseOffsets: Float32Array;
  private readonly geometry: BufferGeometry;
  private readonly positionAttribute: Float32BufferAttribute;

  private readonly xRange: [number, number];
  private readonly yRange: [number, number];
  private readonly zRange: [number, number];

  constructor(config: ParticleFieldConfig) {
    this.count = config.count;
    this.xRange = config.xRange;
    this.yRange = config.yRange;
    this.zRange = config.zRange;

    this.positions = new Float32Array(config.count * 3);
    this.driftSpeeds = new Float32Array(config.count);
    this.phaseOffsets = new Float32Array(config.count);

    for (let index = 0; index < config.count; index += 1) {
      const offset = index * 3;

      this.positions[offset] =
        randomRange(this.xRange[0], this.xRange[1]);
      this.positions[offset + 1] =
        randomRange(this.yRange[0], this.yRange[1]);
      this.positions[offset + 2] =
        randomRange(this.zRange[0], this.zRange[1]);

      this.driftSpeeds[index] =
        randomRange(0.012, 0.032);
      this.phaseOffsets[index] =
        Math.random() * Math.PI * 2;
    }

    this.geometry = new BufferGeometry();
    this.positionAttribute =
      new Float32BufferAttribute(this.positions, 3);
    this.geometry.setAttribute(
      'position',
      this.positionAttribute,
    );

    this.points = new Points(
      this.geometry,
      new PointsMaterial({
        blending: AdditiveBlending,
        color: 0x9edee6,
        depthWrite: false,
        opacity: 0.18,
        size: 0.018,
        sizeAttenuation: true,
        transparent: true,
      }),
    );

    this.points.name = 'ResonanceReefSuspendedParticles';
  }

  update(deltaSeconds: number, timeSeconds: number): void {
    for (let index = 0; index < this.count; index += 1) {
      const offset = index * 3;
      const phase = this.phaseOffsets[index];

      this.positions[offset] +=
        Math.sin(timeSeconds * 0.14 + phase) *
        deltaSeconds *
        0.018;
      this.positions[offset + 1] +=
        this.driftSpeeds[index] * deltaSeconds;
      this.positions[offset + 2] +=
        Math.cos(timeSeconds * 0.11 + phase) *
        deltaSeconds *
        0.014;

      if (this.positions[offset] > this.xRange[1]) {
        this.positions[offset] = this.xRange[0];
      } else if (this.positions[offset] < this.xRange[0]) {
        this.positions[offset] = this.xRange[1];
      }

      if (this.positions[offset + 1] > this.yRange[1]) {
        this.positions[offset + 1] = this.yRange[0];
      }

      if (this.positions[offset + 2] > this.zRange[1]) {
        this.positions[offset + 2] = this.zRange[0];
      } else if (this.positions[offset + 2] < this.zRange[0]) {
        this.positions[offset + 2] = this.zRange[1];
      }
    }

    this.positionAttribute.needsUpdate = true;
  }
}
