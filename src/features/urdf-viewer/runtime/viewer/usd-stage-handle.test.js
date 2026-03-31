import test from "node:test";
import assert from "node:assert/strict";

import { disposeUsdStageHandle } from "./usd-stage-handle.js";

test("disposeUsdStageHandle deletes opened stages and flushes pending deletes", () => {
    let deleteCount = 0;
    let flushCount = 0;

    disposeUsdStageHandle({
        flushPendingDeletes() {
            flushCount += 1;
        },
    }, {
        delete() {
            deleteCount += 1;
        },
    });

    assert.equal(deleteCount, 1);
    assert.equal(flushCount, 1);
});
