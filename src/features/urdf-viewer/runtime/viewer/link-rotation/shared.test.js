import test from "node:test";
import assert from "node:assert/strict";

import {
    clampJointAnglePreservingNeutralZero,
    extractPhysicsPayloadAssetPathsFromLayerText,
    getInteractiveJointLimits,
} from "./shared.js";

test("extractPhysicsPayloadAssetPathsFromLayerText captures USDA physics payload references", () => {
    const layerText = `#usda 1.0
(
    defaultPrim = "go2_description"
)

def Xform "go2_description"
{
    variantSet "Physics" = {
        "PhysX" (
            prepend payload = @configuration/go2_description_physics.usda@
        ) {
        }
    }
}
`;

    assert.deepEqual(
        extractPhysicsPayloadAssetPathsFromLayerText(layerText),
        ["configuration/go2_description_physics.usda"],
    );
});

test("getInteractiveJointLimits preserves one-sided joint limits", () => {
    assert.deepEqual(getInteractiveJointLimits(10, 20), {
        lower: 10,
        upper: 20,
    });

    assert.deepEqual(getInteractiveJointLimits(-20, -10), {
        lower: -20,
        upper: -10,
    });
});

test("clampJointAnglePreservingNeutralZero does not widen one-sided limits to neutral zero", () => {
    assert.equal(clampJointAnglePreservingNeutralZero(0, 10, 20), 10);
    assert.equal(clampJointAnglePreservingNeutralZero(1e-9, 10, 20), 10);

    assert.equal(clampJointAnglePreservingNeutralZero(0, -20, -10), -10);
    assert.equal(clampJointAnglePreservingNeutralZero(-1e-9, -20, -10), -10);

    assert.equal(clampJointAnglePreservingNeutralZero(0, -20, 20), 0);
});
