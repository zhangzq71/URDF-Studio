import test from 'node:test';
import assert from 'node:assert/strict';

import * as sharedUtils from './index';

test('shared utils expose robot file support helpers for library export and import accept filters', () => {
  const robotFileSupport = sharedUtils as typeof sharedUtils & {
    isLibraryRobotExportableFormat?: (format: string) => boolean;
    ROBOT_IMPORT_ACCEPT_ATTRIBUTE?: string;
  };

  assert.equal(typeof robotFileSupport.isLibraryRobotExportableFormat, 'function');
  assert.equal(robotFileSupport.isLibraryRobotExportableFormat?.('urdf'), true);
  assert.equal(robotFileSupport.isLibraryRobotExportableFormat?.('mjcf'), true);
  assert.equal(robotFileSupport.isLibraryRobotExportableFormat?.('xacro'), true);
  assert.equal(robotFileSupport.isLibraryRobotExportableFormat?.('sdf'), true);
  assert.equal(robotFileSupport.isLibraryRobotExportableFormat?.('usd'), false);

  assert.match(robotFileSupport.ROBOT_IMPORT_ACCEPT_ATTRIBUTE ?? '', /(^|,)\.mjcf(,|$)/);
});
