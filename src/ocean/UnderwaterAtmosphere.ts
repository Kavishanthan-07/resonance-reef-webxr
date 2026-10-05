import {
  AdditiveBlending,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
} from '@iwsdk/core';

import type { BreathState } from '../breathing/BreathEngine.js';
import type { CurrentSample } from './WaterCurrent.js';

export const DEBUG_UNDERWATER = false;

export const UNDERWATER_ATMOSPHERE_CONFIG = {
  causticsIntensity: 0.16,
  causticsScale: 14.5,
  causticsSpeed: 0.11,
  fogFar: 28,
  fogNear: 9,
  shaftOpacity: 0.034,
  surfaceOpacity: 0.115,
} as const;

const CAUSTICS_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const CAUSTICS_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uScale;
  uniform float uBreathCalm;
  uniform float uCurrentDistortion;
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vec2 p = vUv * uScale;
    float t = uTime;
    p += vec2(
      sin(p.y * 1.7 + t * 0.7),
      cos(p.x * 1.35 - t * 0.55)
    ) * (0.09 + uCurrentDistortion * 0.16);
    p += vWorldPosition.xz * 0.06 * uCurrentDistortion;

    float a = sin(p.x * 2.7 + t);
    float b = sin((p.x + p.y) * 2.05 - t * 0.72);
    float c = sin(length(p - 2.8) * 3.4 + t * 0.86);
    float pattern = (a + b + c) / 3.0;
    pattern = smoothstep(0.48, 0.92, pattern);

    float edgeFade =
      smoothstep(0.0, 0.18, vUv.x) *
      smoothstep(1.0, 0.82, vUv.x) *
      smoothstep(0.0, 0.16, vUv.y) *
      smoothstep(1.0, 0.82, vUv.y);
    float alpha = pattern * edgeFade * uIntensity * uBreathCalm;

    gl_FragColor = vec4(0.60, 0.88, 0.90, alpha);
  }
`;

const SURFACE_VERTEX_SHADER = `
  uniform float uTime;
  varying vec2 vUv;
  varying float vLift;

  void main() {
    vUv = uv;
    vec3 transformed = position;
    transformed.z +=
      sin(position.x * 0.42 + uTime * 0.22) * 0.06 +
      cos(position.y * 0.36 - uTime * 0.18) * 0.045;
    vLift = transformed.z;
    vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const SURFACE_FRAGMENT_SHADER = `
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vLift;

  void main() {
    float radial = distance(vUv, vec2(0.5));
    float softEdge = smoothstep(0.72, 0.22, radial);
    float ripple =
      0.5 + 0.5 * sin((vUv.x + vUv.y) * 22.0 + vLift * 12.0);
    float alpha = softEdge * uOpacity * (0.45 + ripple * 0.2);
    vec3 color = mix(
      vec3(0.08, 0.28, 0.34),
      vec3(0.52, 0.90, 0.92),
      smoothstep(0.15, 0.82, vUv.y)
    );
    gl_FragColor = vec4(color, alpha);
  }
`;

const SHAFT_VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SHAFT_FRAGMENT_SHADER = `
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    float verticalFade =
      smoothstep(0.02, 0.2, vUv.y) *
      smoothstep(1.0, 0.32, vUv.y);
    float sideFade =
      smoothstep(0.0, 0.18, vUv.x) *
      smoothstep(1.0, 0.82, vUv.x);
    float alpha = verticalFade * sideFade * uOpacity;
    gl_FragColor = vec4(0.54, 0.88, 0.92, alpha);
  }
`;

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class UnderwaterAtmosphere {
  readonly root = new Group();

  private readonly causticsMaterial: ShaderMaterial;
  private readonly surfaceMaterial: ShaderMaterial;
  private readonly shaftMaterial: ShaderMaterial;
  private readonly shaftRoots: Group[] = [];

  private currentDistortion = 0;

  constructor() {
    this.root.name = 'ResonanceReefUnderwaterAtmosphere';

    this.causticsMaterial = this.createCausticsMaterial();
    this.surfaceMaterial = this.createSurfaceMaterial();
    this.shaftMaterial = this.createShaftMaterial();

    this.addCaustics();
    this.addSurfaceSuggestion();
    this.addLightShafts();
    this.addDistantReefSilhouettes();
  }

  update(
    deltaSeconds: number,
    timeSeconds: number,
    breath: BreathState,
    current?: CurrentSample,
  ): void {
    const breathCalm =
      breath.phase === 'inhale'
        ? 1.03 + breath.progress * 0.02
        : 1.0 - breath.progress * 0.018;
    const currentStrength =
      current?.phase === 'expanding'
        ? current.strength
        : 0;

    this.currentDistortion +=
      (Math.min(0.14, currentStrength * 0.2) -
        this.currentDistortion) *
      Math.min(1, deltaSeconds * 2.4);

    this.causticsMaterial.uniforms.uTime.value =
      timeSeconds *
      UNDERWATER_ATMOSPHERE_CONFIG.causticsSpeed;
    this.causticsMaterial.uniforms.uBreathCalm.value =
      breathCalm;
    this.causticsMaterial.uniforms.uCurrentDistortion.value =
      this.currentDistortion;
    this.surfaceMaterial.uniforms.uTime.value =
      timeSeconds;

    for (
      let index = 0;
      index < this.shaftRoots.length;
      index += 1
    ) {
      const shaft = this.shaftRoots[index];

      shaft.position.x +=
        Math.sin(timeSeconds * 0.08 + index) *
        deltaSeconds *
        0.018;
      shaft.rotation.z +=
        Math.sin(timeSeconds * 0.11 + index * 0.7) *
        deltaSeconds *
        0.004;
    }
  }

  dispose(): void {
    this.causticsMaterial.dispose();
    this.surfaceMaterial.dispose();
    this.shaftMaterial.dispose();
  }

  private createCausticsMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      blending: AdditiveBlending,
      depthWrite: false,
      fragmentShader: CAUSTICS_FRAGMENT_SHADER,
      transparent: true,
      uniforms: {
        uBreathCalm: { value: 1 },
        uCurrentDistortion: { value: 0 },
        uIntensity: {
          value:
            UNDERWATER_ATMOSPHERE_CONFIG.causticsIntensity,
        },
        uScale: {
          value:
            UNDERWATER_ATMOSPHERE_CONFIG.causticsScale,
        },
        uTime: { value: 0 },
      },
      vertexShader: CAUSTICS_VERTEX_SHADER,
    });
  }

  private createSurfaceMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      depthWrite: false,
      fragmentShader: SURFACE_FRAGMENT_SHADER,
      side: DoubleSide,
      transparent: true,
      uniforms: {
        uOpacity: {
          value:
            UNDERWATER_ATMOSPHERE_CONFIG.surfaceOpacity,
        },
        uTime: { value: 0 },
      },
      vertexShader: SURFACE_VERTEX_SHADER,
    });
  }

  private createShaftMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      blending: AdditiveBlending,
      depthWrite: false,
      fragmentShader: SHAFT_FRAGMENT_SHADER,
      side: DoubleSide,
      transparent: true,
      uniforms: {
        uOpacity: {
          value:
            UNDERWATER_ATMOSPHERE_CONFIG.shaftOpacity,
        },
      },
      vertexShader: SHAFT_VERTEX_SHADER,
    });
  }

  private addCaustics(): void {
    const caustics = new Mesh(
      new PlaneGeometry(40, 40, 1, 1),
      this.causticsMaterial,
    );

    caustics.name = 'ReefCausticsProjection';
    caustics.position.set(0, -0.035, 0);
    caustics.rotation.x = -Math.PI / 2;
    this.root.add(caustics);
  }

  private addSurfaceSuggestion(): void {
    const surface = new Mesh(
      new PlaneGeometry(18, 17, 18, 14),
      this.surfaceMaterial,
    );

    surface.name = 'ReefDistantWaterSurfaceSuggestion';
    surface.position.set(0, 7.2, -4.2);
    surface.rotation.x = -Math.PI / 2;
    this.root.add(surface);
  }

  private addLightShafts(): void {
    const geometry = new ConeGeometry(
      0.52,
      7.2,
      8,
      1,
      true,
    );
    const placements = [
      [-3.1, 3.1, -3.1, 0.2, -0.32, 0.8],
      [-1.2, 3.35, -4.8, -0.14, 0.16, 1.1],
      [1.0, 3.2, -5.5, 0.12, 0.28, 0.9],
      [2.8, 3.0, -6.8, -0.24, -0.14, 0.74],
      [0.3, 3.45, -7.5, 0.08, -0.08, 0.58],
    ] as const;

    placements.forEach((placement, index) => {
      const root = new Group();
      const shaft = new Mesh(
        geometry,
        this.shaftMaterial,
      );

      root.name = `ReefCinematicLightShaft-${index}`;
      root.position.set(
        placement[0],
        placement[1],
        placement[2],
      );
      root.rotation.set(
        placement[3],
        placement[4],
        index % 2 === 0 ? 0.08 : -0.06,
      );
      root.scale.set(
        placement[5],
        1,
        placement[5] * randomRange(0.75, 1.22),
      );
      shaft.position.y = -2.2;
      root.add(shaft);
      this.shaftRoots.push(root);
      this.root.add(root);
    });
  }

  private addDistantReefSilhouettes(): void {
    const materials = [
      new MeshBasicMaterial({
        color: 0x092d35,
        fog: true,
      }),
      new MeshBasicMaterial({
        color: 0x0b3940,
        fog: true,
      }),
    ];
    const placements = [
      [-8.8, 0.18, -12.5, 3.1, 0.7, 1.1],
      [4.6, 0.03, -16.2, 3.8, 0.82, 1.25],
      [13.8, 0.08, -7.8, 3.2, 0.74, 1.15],
      [-7.4, 0.02, 15.2, 2.9, 0.62, 0.92],
    ] as const;
    const geometries = [
      new DodecahedronGeometry(1, 0),
      new IcosahedronGeometry(1, 0),
      new SphereGeometry(1, 7, 5),
    ];

    placements.forEach((placement, index) => {
      const silhouette = new Mesh(
        geometries[index % geometries.length],
        materials[index % materials.length],
      );

      silhouette.name =
        `ReefDistantSilhouette-${index}`;
      silhouette.position.set(
        placement[0],
        placement[1],
        placement[2],
      );
      silhouette.scale.set(
        placement[3],
        placement[4],
        placement[5],
      );
      silhouette.rotation.set(
        randomRange(-0.12, 0.18),
        randomRange(0, Math.PI),
        randomRange(-0.08, 0.1),
      );
      this.root.add(silhouette);
    });

    const ridgeMaterial = new MeshBasicMaterial({
      color: 0x082a31,
      fog: true,
    });
    const ridge = new Mesh(
      new CylinderGeometry(1, 1.2, 1.2, 7),
      ridgeMaterial,
    );

    ridge.name = 'ReefDistantLowRidge';
    ridge.position.set(-15.4, 0.18, 8.8);
    ridge.rotation.set(0.08, 0.72, Math.PI / 2);
    ridge.scale.set(0.52, 3.4, 0.42);
    this.root.add(ridge);
  }
}
