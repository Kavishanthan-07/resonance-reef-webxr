type Vec3Tuple = readonly [number, number, number];

export type ReefDecorAssetId =
  | 'coral-a'
  | 'coral-c'
  | 'coral-d'
  | 'coral-f'
  | 'seaweed-a'
  | 'seaweed-b'
  | 'seaweed-c';

export type ReefDecorCategory =
  | 'coral'
  | 'seaweed';

export interface ReefDecorPlacement {
  assetId: ReefDecorAssetId;
  category: ReefDecorCategory;
  name: string;
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  scale: number;
  responsiveness: number;
}

export const REEF_CORAL_PLACEMENTS: readonly ReefDecorPlacement[] = [
  {
    assetId: 'coral-a',
    category: 'coral',
    name: 'ImportedCoral-ForegroundLeft',
    position: [-2.55, 0.03, -2.85],
    responsiveness: 0.56,
    rotation: [0, 0.45, -0.06],
    scale: 0.2,
  },
  {
    assetId: 'coral-d',
    category: 'coral',
    name: 'ImportedCoral-ForegroundRight',
    position: [2.4, 0.02, -3.0],
    responsiveness: 0.58,
    rotation: [0, -0.52, 0.04],
    scale: 0.19,
  },
  {
    assetId: 'coral-c',
    category: 'coral',
    name: 'ImportedCoral-MidLeftCluster',
    position: [-2.05, 0.06, -4.25],
    responsiveness: 0.68,
    rotation: [0, 1.12, 0.02],
    scale: 0.28,
  },
  {
    assetId: 'coral-f',
    category: 'coral',
    name: 'ImportedCoral-MidRightCluster',
    position: [2.1, 0.05, -4.55],
    responsiveness: 0.66,
    rotation: [0, -1.0, -0.02],
    scale: 0.27,
  },
  {
    assetId: 'coral-a',
    category: 'coral',
    name: 'ImportedCoral-LowLeftDetail',
    position: [-0.95, 0.02, -5.25],
    responsiveness: 0.6,
    rotation: [0, -0.2, 0.02],
    scale: 0.16,
  },
  {
    assetId: 'coral-d',
    category: 'coral',
    name: 'ImportedCoral-LowRightDetail',
    position: [0.98, 0.02, -5.45],
    responsiveness: 0.6,
    rotation: [0, 0.25, -0.02],
    scale: 0.17,
  },
  {
    assetId: 'coral-c',
    category: 'coral',
    name: 'ImportedCoral-BackLeft',
    position: [-3.25, 0.03, -6.25],
    responsiveness: 0.5,
    rotation: [0, 0.75, 0],
    scale: 0.2,
  },
  {
    assetId: 'coral-f',
    category: 'coral',
    name: 'ImportedCoral-BackRight',
    position: [3.3, 0.03, -6.55],
    responsiveness: 0.48,
    rotation: [0, -0.68, 0],
    scale: 0.21,
  },
  {
    assetId: 'coral-a',
    category: 'coral',
    name: 'ImportedCoral-DeepCenterLeft',
    position: [-1.25, 0.02, -7.25],
    responsiveness: 0.44,
    rotation: [0, 1.65, -0.03],
    scale: 0.17,
  },
  {
    assetId: 'coral-c',
    category: 'coral',
    name: 'ImportedCoral-DeepCenterRight',
    position: [1.45, 0.02, -7.45],
    responsiveness: 0.44,
    rotation: [0, -1.55, 0.03],
    scale: 0.17,
  },
] as const;

export const REEF_SEAWEED_PLACEMENTS: readonly ReefDecorPlacement[] = [
  {
    assetId: 'seaweed-b',
    category: 'seaweed',
    name: 'ImportedSeaweed-LeftEdgeFront',
    position: [-3.55, -0.03, -3.35],
    responsiveness: 0.82,
    rotation: [0, 0.25, 0],
    scale: 0.46,
  },
  {
    assetId: 'seaweed-c',
    category: 'seaweed',
    name: 'ImportedSeaweed-RightEdgeFront',
    position: [3.35, -0.03, -3.7],
    responsiveness: 0.8,
    rotation: [0, -0.35, 0],
    scale: 0.44,
  },
  {
    assetId: 'seaweed-b',
    category: 'seaweed',
    name: 'ImportedSeaweed-LeftMidRock',
    position: [-2.85, -0.04, -5.05],
    responsiveness: 0.9,
    rotation: [0, 1.08, 0],
    scale: 0.5,
  },
  {
    assetId: 'seaweed-c',
    category: 'seaweed',
    name: 'ImportedSeaweed-RightMidRock',
    position: [2.9, -0.04, -5.35],
    responsiveness: 0.88,
    rotation: [0, -1.14, 0],
    scale: 0.48,
  },
  {
    assetId: 'seaweed-b',
    category: 'seaweed',
    name: 'ImportedSeaweed-LowLeft',
    position: [-3.65, -0.05, -6.8],
    responsiveness: 0.86,
    rotation: [0, -0.8, 0],
    scale: 0.45,
  },
  {
    assetId: 'seaweed-c',
    category: 'seaweed',
    name: 'ImportedSeaweed-LowRight',
    position: [3.6, -0.05, -7.05],
    responsiveness: 0.86,
    rotation: [0, 0.9, 0],
    scale: 0.45,
  },
  {
    assetId: 'seaweed-b',
    category: 'seaweed',
    name: 'ImportedSeaweed-BackCenter',
    position: [-0.25, -0.05, -7.75],
    responsiveness: 0.72,
    rotation: [0, 0.1, 0],
    scale: 0.42,
  },
  {
    assetId: 'seaweed-a',
    category: 'seaweed',
    name: 'ImportedSeaweed-HeroEdge',
    position: [0.95, -0.05, -6.95],
    responsiveness: 0.78,
    rotation: [0, -0.42, 0],
    scale: 0.35,
  },
] as const;
