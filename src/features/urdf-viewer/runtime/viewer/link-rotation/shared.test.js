import test from "node:test";
import assert from "node:assert/strict";

import { extractPhysicsPayloadAssetPathsFromLayerText } from "./shared.js";

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
