import {
  AssetType,
  defineAssets,
} from '@iwsdk/core';

const baseUrl = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

export default defineAssets({
  'reef-fish-a': {
    name: 'Reef Fish A',
    priority: 'critical',
    type: AssetType.GLTF,
    url: `${baseUrl}models/fish/reef-fish-a.glb`,
  },
  'bass-fish': {
    name: 'Bass Fish',
    priority: 'lazy',
    type: AssetType.GLTF,
    url: `${baseUrl}models/fish/bass-fish.glb`,
  },
  'butterfly-fish': {
    name: 'Butterfly Fish',
    priority: 'lazy',
    type: AssetType.GLTF,
    url: `${baseUrl}models/fish/butterfly-fish.glb`,
  },
  'manta-ray': {
    name: 'Manta Ray',
    priority: 'lazy',
    type: AssetType.GLTF,
    url: `${baseUrl}models/fish/manta-ray.glb`,
  },
  'coral-a': {
    name: 'Coral A',
    priority: 'lazy',
    type: AssetType.GLTF,
    url: `${baseUrl}models/environment/coral/coral-a.glb`,
  },
  'coral-c': {
    name: 'Coral C',
    priority: 'lazy',
    type: AssetType.GLTF,
    url: `${baseUrl}models/environment/coral/coral-c.glb`,
  },
  'coral-d': {
    name: 'Coral D',
    priority: 'lazy',
    type: AssetType.GLTF,
    url: `${baseUrl}models/environment/coral/coral-d.glb`,
  },
  'coral-f': {
    name: 'Coral F',
    priority: 'lazy',
    type: AssetType.GLTF,
    url: `${baseUrl}models/environment/coral/coral-f.glb`,
  },
  'seaweed-a': {
    name: 'Seaweed A',
    priority: 'lazy',
    type: AssetType.GLTF,
    url: `${baseUrl}models/environment/vegetation/seaweed-a.glb`,
  },
  'seaweed-b': {
    name: 'Seaweed B',
    priority: 'lazy',
    type: AssetType.GLTF,
    url: `${baseUrl}models/environment/vegetation/seaweed-b.glb`,
  },
  'seaweed-c': {
    name: 'Seaweed C',
    priority: 'lazy',
    type: AssetType.GLTF,
    url: `${baseUrl}models/environment/vegetation/seaweed-c.glb`,
  },
});
