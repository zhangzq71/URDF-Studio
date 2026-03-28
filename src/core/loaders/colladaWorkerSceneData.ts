import * as THREE from 'three';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';

import { ensureWorkerXmlDomApis } from '@/core/utils/ensureWorkerXmlDomApis';

import { normalizeColladaUpAxis } from './colladaUpAxis';

export interface SerializedColladaSceneData {
  resourcePath: string;
  sceneJson: Record<string, unknown>;
}

interface SerializedSceneImageRecord {
  url?: string | string[];
  uuid?: string;
}

export function canSerializeColladaInWorker(_content: string): boolean {
  return true;
}

function captureTextureSourceUrls<T>(run: () => T): {
  capturedImageUrls: Map<string, string>;
  result: T;
} {
  const capturedImageUrls = new Map<string, string>();
  const originalTextureLoad = THREE.TextureLoader.prototype.load;

  THREE.TextureLoader.prototype.load = function patchedTextureLoad(
    url,
    onLoad,
    onProgress,
    onError,
  ) {
    const texture = originalTextureLoad.call(this, url, onLoad, onProgress, onError);
    capturedImageUrls.set(texture.source.uuid, url);
    return texture;
  };

  try {
    return {
      result: run(),
      capturedImageUrls,
    };
  } finally {
    THREE.TextureLoader.prototype.load = originalTextureLoad;
  }
}

function applyCapturedColladaImageUrls(
  sceneJson: Record<string, unknown>,
  capturedImageUrls: Map<string, string>,
): void {
  const images = sceneJson.images;
  if (!Array.isArray(images)) {
    return;
  }

  images.forEach((entry) => {
    const image = entry as SerializedSceneImageRecord;
    if (!image.uuid) {
      return;
    }

    const capturedUrl = capturedImageUrls.get(image.uuid);
    if (!capturedUrl) {
      return;
    }

    image.url = capturedUrl;
  });
}

export function parseColladaSceneData(
  content: string,
  assetUrl: string,
): SerializedColladaSceneData {
  ensureWorkerXmlDomApis();
  const { content: normalizedContent } = normalizeColladaUpAxis(content);
  const loader = new ColladaLoader();
  const baseUrl = THREE.LoaderUtils.extractUrlBase(assetUrl);
  const { capturedImageUrls, result: scene } = captureTextureSourceUrls(
    () => loader.parse(normalizedContent, baseUrl).scene,
  );
  const sceneJson = scene.toJSON() as Record<string, unknown>;
  applyCapturedColladaImageUrls(sceneJson, capturedImageUrls);

  return {
    resourcePath: baseUrl,
    sceneJson,
  };
}

export function createSceneFromSerializedColladaData(
  data: SerializedColladaSceneData,
  options: { manager?: THREE.LoadingManager } = {},
): THREE.Object3D {
  const objectLoader = new THREE.ObjectLoader(options.manager);
  objectLoader.setResourcePath(data.resourcePath);
  return objectLoader.parse(data.sceneJson);
}
