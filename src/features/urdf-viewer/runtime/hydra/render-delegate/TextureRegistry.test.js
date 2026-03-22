import test from 'node:test';
import assert from 'node:assert/strict';

import { TextureRegistry } from './TextureRegistry.js';

function installWindowMock() {
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: {
      search: '',
    },
  };

  return () => {
    if (originalWindow === undefined) {
      delete globalThis.window;
      return;
    }
    globalThis.window = originalWindow;
  };
}

function installObjectUrlMocks() {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const createdUrls = [];
  const revokedUrls = [];

  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: () => {
      const nextUrl = `blob:texture-${createdUrls.length + 1}`;
      createdUrls.push(nextUrl);
      return nextUrl;
    },
  });

  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: (url) => {
      revokedUrls.push(String(url || ''));
    },
  });

  return {
    createdUrls,
    revokedUrls,
    restore: () => {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: originalCreateObjectURL,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        writable: true,
        value: originalRevokeObjectURL,
      });
    },
  };
}

function createTextureRegistryForTest() {
  return new TextureRegistry({
    paths: {},
    driver: () => ({
      getFile: (_resourcePath, callback) => {
        callback(Uint8Array.from([1, 2, 3, 4]));
      },
    }),
  });
}

test('TextureRegistry revokes blob object URL after successful texture load', async () => {
  const restoreWindow = installWindowMock();
  const objectUrls = installObjectUrlMocks();
  try {
    const registry = createTextureRegistryForTest();
    registry.loader = {
      load(url, onLoad) {
        onLoad({ loadedFrom: url });
      },
    };

    const texture = await registry.getTexture('textures/base_color.png');

    assert.equal(texture.name, 'textures/base_color.png');
    assert.deepEqual(objectUrls.createdUrls, ['blob:texture-1']);
    assert.deepEqual(objectUrls.revokedUrls, ['blob:texture-1']);
  } finally {
    objectUrls.restore();
    restoreWindow();
  }
});

test('TextureRegistry revokes blob object URL after failed texture load', async () => {
  const restoreWindow = installWindowMock();
  const objectUrls = installObjectUrlMocks();
  try {
    const registry = createTextureRegistryForTest();
    registry.loader = {
      load(_url, _onLoad, _onProgress, onError) {
        onError(new Error('texture decode failed'));
      },
    };

    await assert.rejects(
      registry.getTexture('textures/base_color.png'),
      /texture decode failed/,
    );

    assert.deepEqual(objectUrls.createdUrls, ['blob:texture-1']);
    assert.deepEqual(objectUrls.revokedUrls, ['blob:texture-1']);
  } finally {
    objectUrls.restore();
    restoreWindow();
  }
});
