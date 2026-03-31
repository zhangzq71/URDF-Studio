import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_MOTOR_LIBRARY } from './motorLibrary';
import { mergeMotorLibraryEntries } from './motorLibraryMerge';

test('mergeMotorLibraryEntries adds unique specs and reports parse failures without mutating defaults', () => {
  const originalUnitreeCount = DEFAULT_MOTOR_LIBRARY.Unitree.length;

  const { library, parseFailures } = mergeMotorLibraryEntries([
    {
      path: 'custom/Unitree/Go2.txt',
      content: JSON.stringify({
        name: 'Go2-Custom',
        armature: 0.1,
        velocity: 12,
        effort: 34,
      }),
    },
    {
      path: 'custom/Unitree/Go1-M8010-6.txt',
      content: JSON.stringify({
        name: 'Go1-M8010-6',
        armature: 999,
        velocity: 999,
        effort: 999,
      }),
    },
    {
      path: 'custom/DAMIAO/Broken.txt',
      content: '{not-json}',
    },
  ]);

  assert.equal(parseFailures.length, 1);
  assert.equal(parseFailures[0], 'custom/DAMIAO/Broken.txt');
  assert.equal(library.Unitree.length, originalUnitreeCount + 1);
  assert.ok(library.Unitree.some((entry) => entry.name === 'Go2-Custom'));
  assert.equal(
    library.Unitree.filter((entry) => entry.name === 'Go1-M8010-6').length,
    1,
    'existing motors should not be duplicated',
  );
  assert.equal(
    DEFAULT_MOTOR_LIBRARY.Unitree.length,
    originalUnitreeCount,
    'default motor library should stay immutable',
  );
});

test('mergeMotorLibraryEntries ignores entries that do not include a brand directory', () => {
  const { library, parseFailures } = mergeMotorLibraryEntries([
    {
      path: 'Go2.txt',
      content: JSON.stringify({
        name: 'Ignored',
        armature: 0.1,
        velocity: 12,
        effort: 34,
      }),
    },
  ]);

  assert.equal(parseFailures.length, 0);
  assert.ok(!Object.values(library).some((entries) => entries.some((entry) => entry.name === 'Ignored')));
});
