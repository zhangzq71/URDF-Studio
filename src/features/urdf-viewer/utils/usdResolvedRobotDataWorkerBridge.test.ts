import test from 'node:test';
import assert from 'node:assert/strict';

import { GeometryType, type UsdSceneSnapshot } from '@/types';
import type { ViewerRobotDataResolution } from './viewerRobotData.ts';
import type { UsdOffscreenViewerWorkerResponse } from './usdOffscreenViewerProtocol.ts';
import { createUsdResolvedRobotDataWorkerClient } from './usdResolvedRobotDataWorkerBridge.ts';

type WorkerEventHandler = (event: { data?: unknown; error?: unknown; message?: string }) => void;

class FakeWorker {
  private readonly listeners = new Map<string, Set<WorkerEventHandler>>();

  public readonly postedMessages: unknown[] = [];

  public terminated = false;

  addEventListener(type: string, handler: WorkerEventHandler): void {
    const handlers = this.listeners.get(type) ?? new Set<WorkerEventHandler>();
    handlers.add(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type: string, handler: WorkerEventHandler): void {
    this.listeners.get(type)?.delete(handler);
  }

  postMessage(message: unknown, _transfer?: Transferable[]): void {
    this.postedMessages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emitMessage(message: UsdOffscreenViewerWorkerResponse): void {
    this.listeners.get('message')?.forEach((handler) => {
      handler({ data: message });
    });
  }
}

const demoSnapshot: UsdSceneSnapshot = {
  stageSourcePath: '/robots/go2/usd/go2.usd',
  stage: { defaultPrimPath: '/Robot' },
  robotTree: {
    linkParentPairs: [['/Robot/base_link', null]],
    rootLinkPaths: ['/Robot/base_link'],
  },
  robotMetadataSnapshot: {
    stageSourcePath: '/robots/go2/usd/go2.usd',
    source: 'usd-stage-cpp',
    linkParentPairs: [['/Robot/base_link', null]],
    jointCatalogEntries: [],
    linkDynamicsEntries: [],
    meshCountsByLinkPath: {
      '/Robot/base_link': {
        visualMeshCount: 1,
        collisionMeshCount: 1,
      },
    },
  },
  render: {
    meshDescriptors: [],
    materials: [],
  },
};

const demoResolution: ViewerRobotDataResolution = {
  robotData: {
    name: 'go2',
    rootLinkId: 'base_link',
    links: {
      base_link: {
        id: 'base_link',
        name: 'base_link',
        visible: true,
        visual: {
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
          color: '#ffffff',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        collision: {
          type: GeometryType.NONE,
          dimensions: { x: 0, y: 0, z: 0 },
          color: '#ffffff',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        inertial: {
          mass: 0,
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          inertia: { ixx: 0, ixy: 0, ixz: 0, iyy: 0, iyz: 0, izz: 0 },
        },
      },
    },
    joints: {},
    materials: {},
    closedLoopConstraints: [],
  },
  stageSourcePath: '/robots/go2/usd/go2.usd',
  linkIdByPath: {
    '/Robot/base_link': 'base_link',
  },
  linkPathById: {
    base_link: '/Robot/base_link',
  },
  jointPathById: {},
  childLinkPathByJointId: {},
  parentLinkPathByJointId: {},
  usdSceneSnapshot: demoSnapshot,
};

test('USD resolved robot data worker client resolves the first worker robot-data payload and disposes the worker', async () => {
  const fakeWorker = new FakeWorker();
  const fakeCanvas = {
    width: 1,
    height: 1,
  } as OffscreenCanvas;
  const client = createUsdResolvedRobotDataWorkerClient({
    canUseWorker: () => true,
    createCanvas: () => fakeCanvas,
    createWorker: () => fakeWorker as unknown as Worker,
  });

  const resultPromise = client.resolve(
    {
      name: 'robots/go2/usd/go2.usd',
      content: '#usda 1.0',
      blobUrl: undefined,
      format: 'usd',
    },
    [],
    {},
  );

  assert.equal(fakeWorker.postedMessages.length, 1);
  const initMessage = fakeWorker.postedMessages[0] as { type: string; canvas: OffscreenCanvas; active: boolean };
  assert.equal(initMessage.type, 'init');
  assert.equal(initMessage.canvas, fakeCanvas);
  assert.equal(initMessage.active, false);

  fakeWorker.emitMessage({
    type: 'robot-data',
    resolution: demoResolution,
  });

  const result = await resultPromise;
  assert.equal(result.stageSourcePath, '/robots/go2/usd/go2.usd');
  assert.equal(result.robotData.rootLinkId, 'base_link');
  assert.equal(fakeWorker.terminated, true);
  assert.equal(fakeWorker.postedMessages.length, 2);
  assert.equal((fakeWorker.postedMessages[1] as { type: string }).type, 'dispose');
});
