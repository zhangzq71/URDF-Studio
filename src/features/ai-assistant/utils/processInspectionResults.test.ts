import test from 'node:test'
import assert from 'node:assert/strict'

import { processInspectionResults } from './processInspectionResults.ts'

test('processInspectionResults infers MJCF-relevant item ids when the model omits them', () => {
  const report = processInspectionResults(
    {
      summary: 'Inspection summary',
      issues: [
        {
          type: 'warning',
          title: 'Frame origin drift',
          description: 'Joint origin and coordinate frame are inconsistent near the hip assembly.',
          category: 'kinematics',
        },
        {
          type: 'warning',
          title: 'Armature inertia missing',
          description: 'Rotor equivalent inertia is not configured for the actuator.',
          category: 'hardware',
        },
        {
          type: 'warning',
          title: 'Velocity limit mismatch',
          description: 'Motor torque and velocity limits do not match the selected actuator.',
          category: 'hardware',
        },
      ],
    },
    {
      kinematics: ['frame_alignment'],
      hardware: ['armature_config', 'motor_limits'],
    },
    'en'
  )

  const itemIds = report.issues
    .filter(issue => issue.type !== 'pass')
    .map(issue => issue.itemId)

  assert.deepEqual(itemIds, ['frame_alignment', 'armature_config', 'motor_limits'])
})
