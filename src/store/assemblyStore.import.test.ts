import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_LINK, type RobotFile } from '@/types';
import type { RobotImportResult } from '@/core/parsers/importRobotFile';
import { useAssemblyStore } from './assemblyStore.ts';

function resetAssemblyStore() {
  const state = useAssemblyStore.getState();
  state.clearHistory();
  state.exitAssembly();
  state.setAssembly(null);
}

test('addComponent reuses a pre-resolved ready import result for non-USD files', () => {
  resetAssemblyStore();

  useAssemblyStore.getState().initAssembly('pre-resolved-import');

  const invalidUrdfFile: RobotFile = {
    name: 'robots/demo/broken.urdf',
    content: '<robot name="broken">',
    format: 'urdf',
  };

  const preResolvedImportResult: RobotImportResult = {
    status: 'ready',
    format: 'urdf',
    robotData: {
      name: 'resolved_demo',
      rootLinkId: 'base_link',
      links: {
        base_link: {
          ...DEFAULT_LINK,
          id: 'base_link',
          name: 'base_link',
          visible: true,
        },
      },
      joints: {},
    },
    resolvedUrdfContent: `<?xml version="1.0"?>
<robot name="resolved_demo">
  <link name="base_link" />
</robot>`,
    resolvedUrdfSourceFilePath: 'robots/demo/broken.urdf',
  };

  const component = useAssemblyStore.getState().addComponent(invalidUrdfFile, {
    preResolvedImportResult,
  });

  assert.ok(component, 'component should be created from the pre-resolved import result');
  assert.equal(component?.name, 'broken');
  assert.equal(component?.sourceFile, 'robots/demo/broken.urdf');
  assert.equal(component?.robot.name, 'resolved_demo');
  assert.ok(component?.robot.links.comp_broken_base_link);
  assert.equal(component?.robot.rootLinkId, 'comp_broken_base_link');
});
