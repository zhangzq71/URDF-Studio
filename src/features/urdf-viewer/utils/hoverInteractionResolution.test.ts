import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveHoverInteractionResolution,
  type ResolvedHoverInteractionCandidate,
} from './hoverInteractionResolution.ts';

function createLinkCandidate(
  id: string,
  distance: number,
  subType: 'visual' | 'collision' = 'visual',
): ResolvedHoverInteractionCandidate {
  return {
    type: 'link',
    id,
    linkId: id,
    subType,
    targetKind: 'geometry',
    distance,
  };
}

test('resolveHoverInteractionResolution keeps the first hit as the hover target', () => {
  const candidates = [
    createLinkCandidate('right_wrist_roll_link', 0.58),
    createLinkCandidate('right_wrist_pitch_link', 0.6),
  ];

  const result = resolveHoverInteractionResolution(candidates);

  assert.equal(result.primaryInteraction?.id, 'right_wrist_roll_link');
});

test('resolveHoverInteractionResolution no longer reorders hits by layer priority or stale preferences', () => {
  const candidates = [
    createLinkCandidate('right_wrist_roll_link', 0.58, 'visual'),
    createLinkCandidate('right_wrist_pitch_link', 0.6, 'collision'),
  ];

  const result = resolveHoverInteractionResolution(candidates);

  assert.equal(result.primaryInteraction?.id, 'right_wrist_roll_link');
  assert.equal(result.primaryInteraction?.subType, 'visual');
});

test('resolveHoverInteractionResolution returns null when there are no candidates', () => {
  const result = resolveHoverInteractionResolution([]);

  assert.equal(result.primaryInteraction, null);
});
