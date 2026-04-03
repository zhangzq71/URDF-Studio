import test from "node:test";
import assert from "node:assert/strict";

import { isLikelyNonRenderableUsdConfig } from "./path-utils.js";

test("recognizes Isaac-style configuration USDA sidecars as non-renderable config layers", () => {
    assert.equal(
        isLikelyNonRenderableUsdConfig("/test/unitree_ros_usda/go2_description/urdf/configuration/go2_description_sensor.usda"),
        true,
    );
    assert.equal(
        isLikelyNonRenderableUsdConfig("/test/unitree_ros_usda/h1_2_description/configuration/h1_2_handless_robot.usda"),
        true,
    );
});
