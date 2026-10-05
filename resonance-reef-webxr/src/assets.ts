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
});
