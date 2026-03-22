import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import { parseURDF } from '@/core/parsers/urdf/parser';
import type { RobotState } from '@/types';
import { adaptUsdViewerSnapshotToRobotData } from '@/features/urdf-viewer/utils/usdViewerRobotAdapter';
import { ThreeRenderDelegateCore } from '@/features/urdf-viewer/runtime/hydra/render-delegate/ThreeRenderDelegateCore.js';
import { exportRobotToUsd } from './usdExport';

const GO2_DESCRIPTION_ROOT = path.resolve('test/unitree_ros/robots/go2_description');
const GO2_URDF_PATH = path.join(GO2_DESCRIPTION_ROOT, 'urdf/go2_description.urdf');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser as typeof DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer as typeof XMLSerializer;
globalThis.ProgressEvent = dom.window.ProgressEvent as typeof ProgressEvent;

function loadGo2RobotState(): RobotState {
  const source = fs.readFileSync(GO2_URDF_PATH, 'utf8');
  const robot = parseURDF(source);
  assert.ok(robot, 'expected go2 URDF to parse');
  return robot;
}

function buildGo2AssetMap(): Record<string, string> {
  const assets: Record<string, string> = {};

  for (const directory of ['dae', 'meshes']) {
    const absoluteDirectory = path.join(GO2_DESCRIPTION_ROOT, directory);
    for (const fileName of fs.readdirSync(absoluteDirectory)) {
      const absolutePath = path.join(absoluteDirectory, fileName);
      if (!fs.statSync(absolutePath).isFile()) continue;

      const extension = path.extname(absolutePath).toLowerCase();
      const mimeType = extension === '.dae'
        ? 'text/xml'
        : extension === '.png'
          ? 'image/png'
          : 'application/octet-stream';
      const dataUrl = `data:${mimeType};base64,${fs.readFileSync(absolutePath).toString('base64')}`;

      [
        `package://go2_description/${directory}/${fileName}`,
        `go2_description/${directory}/${fileName}`,
        `${directory}/${fileName}`,
        fileName,
      ].forEach((key) => {
        assets[key] = dataUrl;
      });
    }
  }

  return assets;
}

function createUvObjBlob(): Blob {
  return new Blob([[
    'o textured_triangle',
    'v 0 0 0',
    'v 1 0 0',
    'v 0 1 0',
    'vt 0 0',
    'vt 1 0',
    'vt 0 1',
    'f 1/1 2/2 3/3',
  ].join('\n')], { type: 'text/plain;charset=utf-8' });
}

function createTexturedMeshRobot(meshPath: string, texturePath: string): RobotState {
  return {
    name: 'mesh_robot_textured',
    rootLinkId: 'base_link',
    selection: { type: null, id: null },
    joints: {},
    links: {
      base_link: {
        id: 'base_link',
        name: 'base_link',
        visible: true,
        visual: {
          type: 'mesh',
          meshPath,
          dimensions: { x: 1, y: 1, z: 1 },
          color: '#ffffff',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        collision: {
          type: 'none',
          dimensions: { x: 0, y: 0, z: 0 },
          color: '#000000',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        },
        collisionBodies: [],
      },
    },
    materials: {
      base_link: {
        color: '#ffffff',
        texture: texturePath,
      },
    },
  };
}

async function withSuppressedColladaLogs<T>(run: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const isColladaNoise = (value: unknown) => String(value || '').includes('THREE.ColladaLoader');

  console.log = (...args: unknown[]) => {
    if (!isColladaNoise(args[0])) {
      originalLog(...args);
    }
  };
  console.info = (...args: unknown[]) => {
    if (!isColladaNoise(args[0])) {
      originalInfo(...args);
    }
  };
  console.warn = (...args: unknown[]) => {
    if (!isColladaNoise(args[0])) {
      originalWarn(...args);
    }
  };

  try {
    return await run();
  } finally {
    console.log = originalLog;
    console.info = originalInfo;
    console.warn = originalWarn;
  }
}

function buildLinkPaths(robot: RobotState): Map<string, string> {
  const rootPrimName = 'go2_description';
  const childJointsByParent = new Map<string, typeof robot.joints[string][]>();
  Object.values(robot.joints).forEach((joint) => {
    const entries = childJointsByParent.get(joint.parentLinkId) || [];
    entries.push(joint);
    childJointsByParent.set(joint.parentLinkId, entries);
  });

  const linkPathById = new Map<string, string>();
  const visit = (linkId: string, parentPath: string | null) => {
    const link = robot.links[linkId];
    assert.ok(link, `expected link "${linkId}" to exist`);
    const linkPath = parentPath ? `${parentPath}/${link.name}` : `/${rootPrimName}/${link.name}`;
    linkPathById.set(linkId, linkPath);

    for (const joint of childJointsByParent.get(linkId) || []) {
      visit(joint.childLinkId, linkPath);
    }
  };

  visit(robot.rootLinkId, null);
  return linkPathById;
}

function extractUsdPrimBlock(source: string, marker: string): string {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `expected to find USD prim marker: ${marker}`);

  const openBraceIndex = source.indexOf('{', start);
  assert.notEqual(openBraceIndex, -1, `expected USD prim to contain an opening brace: ${marker}`);

  let depth = 0;
  let inString = false;
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const character = source[index];
    const previousCharacter = index > 0 ? source[index - 1] : '';

    if (character === '"' && previousCharacter !== '\\') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === '{') {
      depth += 1;
      continue;
    }

    if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  assert.fail(`expected USD prim block to close cleanly: ${marker}`);
}

function extractMeshDisplayColors(source: string): number[][] {
  return Array.from(source.matchAll(/primvars:displayColor = \[\(([^)]+)\)\]/g))
    .map((match) => match[1]
      .split(',')
      .map((value) => Number(value.trim())));
}

function createRoundtripMetadataSnapshot(
  robot: RobotState,
  layers: {
    rootLayer: string;
    baseLayer: string;
    physicsLayer: string;
    sensorLayer: string;
  },
) {
  const previousWindow = globalThis.window;
  globalThis.window = { driver: null } as Window & typeof globalThis;

  try {
    const fakeMeshes = Object.fromEntries(
      Array.from(buildLinkPaths(robot).values(), (linkPath) => [`${linkPath}/visuals.proto_mesh_id0`, {}]),
    );
    const delegate = Object.create(ThreeRenderDelegateCore.prototype) as ThreeRenderDelegateCore & {
      meshes: Record<string, object>;
    };

    delegate.meshes = fakeMeshes;
    delegate._protoMeshMetadataByMeshId = new Map();
    delegate._robotMetadataSnapshotByStageSource = new Map();
    delegate._robotMetadataBuildPromisesByStageSource = new Map();
    delegate._nowPerfMs = () => 1234;
    delegate.getNormalizedStageSourcePath = () => '/robots/go2_description/usd/go2_description.usd';
    delegate.getStage = () => ({
      GetRootLayer() {
        return {
          ExportToString() {
            return layers.rootLayer;
          },
        };
      },
      GetUsedLayers() {
        return [
          { ExportToString() { return layers.baseLayer; } },
          { ExportToString() { return layers.physicsLayer; } },
          { ExportToString() { return layers.sensorLayer; } },
        ];
      },
    });

    return delegate.buildRobotMetadataSnapshotForStage('/robots/go2_description/usd/go2_description.usd', null);
  } finally {
    globalThis.window = previousWindow;
  }
}

test('go2 USD export avoids baking Collada root correction into the serialized stage', async () => {
  const robot = loadGo2RobotState();
  const assets = buildGo2AssetMap();

  const payload = await withSuppressedColladaLogs(() => exportRobotToUsd({
    robot,
    exportName: 'go2_description',
    assets,
  }));

  const baseLayer = await payload.archiveFiles.get('go2_description/usd/configuration/go2_description_base.usd')?.text();
  assert.ok(baseLayer, 'expected go2 USD base layer to exist');
  assert.match(baseLayer, /def Xform "FL_hip"/);
  assert.match(baseLayer, /custom string urdf:materialColor = "#000000"/);
  assert.match(baseLayer, /def Mesh "hipFL0831"/);
  assert.match(baseLayer, /def Scope "Looks"/);
  assert.match(baseLayer, /uniform token info:id = "UsdPreviewSurface"/);
  assert.match(baseLayer, /rel material:binding = <\/go2_description\/Looks\/Material_\d+>/);
  assert.doesNotMatch(
    baseLayer,
    /def Xform "Scene"[\s\S]{0,200}?quatf xformOp:orient = \(0\.707107, -0\.707107, 0, 0\)/,
  );
});

test('go2 USD export preserves authored multi-material mesh palettes instead of collapsing them to a single color', async () => {
  const robot = loadGo2RobotState();
  const assets = buildGo2AssetMap();

  const payload = await withSuppressedColladaLogs(() => exportRobotToUsd({
    robot,
    exportName: 'go2_description',
    assets,
  }));

  const baseLayer = await payload.archiveFiles.get('go2_description/usd/configuration/go2_description_base.usd')?.text();
  assert.ok(baseLayer, 'expected go2 USD base layer to exist');

  const baseLinkBlock = extractUsdPrimBlock(baseLayer, 'def Xform "base"');
  const baseVisualBlock = extractUsdPrimBlock(baseLinkBlock, 'def Xform "visual_0"');
  const displayColors = extractMeshDisplayColors(baseVisualBlock);
  const averageChannels = displayColors.map((color) => color.reduce((sum, channel) => sum + channel, 0) / color.length);

  assert.ok(displayColors.length >= 5, `expected go2 base visual to preserve multiple mesh subsets, got ${displayColors.length}`);
  assert.ok(new Set(displayColors.map((color) => color.map((channel) => channel.toFixed(6)).join(','))).size >= 4);
  assert.ok(averageChannels.some((value) => value < 0.05), 'expected a near-black authored material subset');
  assert.ok(averageChannels.some((value) => value > 0.9), 'expected a near-white authored material subset');
});

test('go2 USD roundtrip metadata rebuilds the original link and joint hierarchy instead of collapsing to usd_scene_root', async () => {
  const robot = loadGo2RobotState();
  const assets = buildGo2AssetMap();

  const payload = await withSuppressedColladaLogs(() => exportRobotToUsd({
    robot,
    exportName: 'go2_description',
    assets,
  }));

  const metadata = createRoundtripMetadataSnapshot(robot, {
    rootLayer: await payload.archiveFiles.get('go2_description/usd/go2_description.usd')?.text() || '',
    baseLayer: await payload.archiveFiles.get('go2_description/usd/configuration/go2_description_base.usd')?.text() || '',
    physicsLayer: await payload.archiveFiles.get('go2_description/usd/configuration/go2_description_physics.usd')?.text() || '',
    sensorLayer: await payload.archiveFiles.get('go2_description/usd/configuration/go2_description_sensor.usd')?.text() || '',
  });

  assert.equal(metadata.source, 'usd-stage');
  assert.equal(metadata.jointCatalogEntries.length, Object.keys(robot.joints).length);
  assert.equal(metadata.linkParentPairs.length, Object.keys(robot.links).length - 1);

  const adapted = adaptUsdViewerSnapshotToRobotData({
    stageSourcePath: '/robots/go2_description/usd/go2_description.usd',
    stage: { defaultPrimPath: '/go2_description' },
    robotMetadataSnapshot: metadata,
    robotTree: {
      linkParentPairs: metadata.linkParentPairs,
      jointCatalogEntries: metadata.jointCatalogEntries,
      rootLinkPaths: [],
    },
    physics: {
      linkDynamicsEntries: metadata.linkDynamicsEntries,
    },
    render: {
      meshDescriptors: [],
      materials: [],
    },
  });

  assert.ok(adapted, 'expected USD snapshot to adapt back into robot data');
  if (!adapted) {
    return;
  }

  assert.equal(Object.keys(adapted.robotData.links).length, Object.keys(robot.links).length);
  assert.equal(Object.keys(adapted.robotData.joints).length, Object.keys(robot.joints).length);
  assert.equal(adapted.robotData.rootLinkId, 'base');
  assert.equal(adapted.robotData.links.usd_scene_root, undefined);
  assert.ok(Object.values(adapted.robotData.links).some((link) => link.name === 'RR_foot'));

  const flHipJoint = Object.values(adapted.robotData.joints).find((joint) => joint.name === 'FL_hip_joint');
  assert.ok(flHipJoint, 'expected FL_hip_joint to survive roundtrip hydration');
  assert.equal(flHipJoint?.parentLinkId, 'base');
  assert.equal(flHipJoint?.childLinkId, 'FL_hip');
});

test('textured USD roundtrip preserves visual color and texture references after reload hydration', async () => {
  const meshPath = 'meshes/textured_triangle.obj';
  const texturePath = 'textures/checker.png';
  const textureDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFAAH/e+m+7wAAAABJRU5ErkJggg==';
  const robot = createTexturedMeshRobot(meshPath, texturePath);

  const payload = await exportRobotToUsd({
    robot,
    exportName: 'mesh_robot_textured',
    assets: {
      [texturePath]: textureDataUrl,
    },
    extraMeshFiles: new Map([[meshPath, createUvObjBlob()]]),
  });

  const rootLayer = await payload.archiveFiles.get('mesh_robot_textured/usd/mesh_robot_textured.usd')?.text();
  const baseLayer = await payload.archiveFiles.get('mesh_robot_textured/usd/configuration/mesh_robot_textured_description_base.usd')?.text();
  const physicsLayer = await payload.archiveFiles.get('mesh_robot_textured/usd/configuration/mesh_robot_textured_description_physics.usd')?.text();
  const sensorLayer = await payload.archiveFiles.get('mesh_robot_textured/usd/configuration/mesh_robot_textured_description_sensor.usd')?.text();

  assert.ok(rootLayer, 'expected textured USD root layer to exist');
  assert.ok(baseLayer, 'expected textured USD base layer to exist');
  assert.ok(physicsLayer, 'expected textured USD physics layer to exist');
  assert.ok(sensorLayer, 'expected textured USD sensor layer to exist');

  const materialBindingMatch = baseLayer.match(/rel material:binding = <([^>]+)>/);
  assert.ok(materialBindingMatch, 'expected exported textured mesh to bind a preview material');

  const metadata = createRoundtripMetadataSnapshot(robot, {
    rootLayer,
    baseLayer,
    physicsLayer,
    sensorLayer,
  });

  const defaultPrimPath = '/mesh_robot_textured_description';
  const linkPath = `${defaultPrimPath}/base_link`;
  const adapted = adaptUsdViewerSnapshotToRobotData({
    stageSourcePath: '/robots/mesh_robot_textured/usd/mesh_robot_textured.usd',
    stage: {
      defaultPrimPath,
    },
    robotMetadataSnapshot: metadata,
    robotTree: {
      linkParentPairs: metadata.linkParentPairs,
      jointCatalogEntries: metadata.jointCatalogEntries,
      rootLinkPaths: [linkPath],
    },
    physics: {
      linkDynamicsEntries: metadata.linkDynamicsEntries,
    },
    render: {
      meshDescriptors: [
        {
          meshId: `${linkPath}/visuals.proto_mesh_id0`,
          sectionName: 'visuals',
          resolvedPrimPath: `${linkPath}/visuals/visual_0/visual/textured_triangle`,
          primType: 'mesh',
          materialId: materialBindingMatch[1],
        },
      ],
      materials: [
        {
          materialId: materialBindingMatch[1],
          color: [1, 1, 1, 1],
          mapPath: '../assets/checker.png',
        },
      ],
    },
  });

  assert.ok(adapted, 'expected textured USD snapshot to adapt back into robot data');
  if (!adapted) {
    return;
  }

  const reloadedLinkId = adapted.linkIdByPath[linkPath];
  assert.ok(reloadedLinkId, 'expected textured roundtrip to map the exported base link path back to a live link id');
  assert.equal(adapted.robotData.rootLinkId, reloadedLinkId);
  assert.equal(adapted.linkPathById[reloadedLinkId], linkPath);
  assert.equal(adapted.robotData.links[reloadedLinkId]?.visual.color, '#ffffff');
  assert.equal(adapted.robotData.materials?.[reloadedLinkId]?.color, '#ffffff');
  assert.equal(adapted.robotData.materials?.[reloadedLinkId]?.texture, '../assets/checker.png');
});
