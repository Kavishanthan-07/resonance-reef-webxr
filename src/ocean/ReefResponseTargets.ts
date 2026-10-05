import {
  Color,
  Group,
  MeshStandardMaterial,
} from '@iwsdk/core';

export interface SwayTarget {
  root: Group;
  phase: number;
  amplitude: number;
  speed: number;
  responsiveness: number;
  baseRotationX: number;
  baseRotationZ: number;
  bendX: number;
  bendZ: number;
  impact: number;
  hitPulseId: number;
}

export interface CoralTarget {
  root: Group;
  materials: MeshStandardMaterial[];
  baseColors: Color[];
  baseEmissives: Color[];
  responsiveness: number;
  impact: number;
  hitPulseId: number;
}
