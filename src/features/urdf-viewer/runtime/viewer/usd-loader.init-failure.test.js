import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const loaderPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "./usd-loader.js",
);

test("usd-loader keeps init-failure branches non-ready and captures explicit failure reason", async () => {
    const source = await readFile(loaderPath, "utf8");

    const initFailurePatterns = [
        /catch\s*\(\s*error\s*\)\s*\{[\s\S]*?Failed to create USD driver[\s\S]*?state\.ready\s*=\s*false;[\s\S]*?state\.drawFailed\s*=\s*true;[\s\S]*?state\.drawFailureReason\s*=\s*"driver-init-failed";/m,
        /if\s*\(\s*!driver\s*\)\s*\{[\s\S]*?Failed to initialize USD renderer for this file\.[\s\S]*?state\.ready\s*=\s*false;[\s\S]*?state\.drawFailed\s*=\s*true;[\s\S]*?state\.drawFailureReason\s*=\s*"driver-init-missing";/m,
    ];

    for (const pattern of initFailurePatterns) {
        assert.match(source, pattern);
    }
});

test("usd-loader blocks ready state when robot metadata warmup fails or resolves stale snapshots", async () => {
    const source = await readFile(loaderPath, "utf8");

    assert.match(
        source,
        /if \(stats\.stale === true \|\| stats\.errorFlags\.length > 0 \|\| !!stats\.truthLoadError\) \{\s*return false;\s*\}/m,
    );
    assert.match(
        source,
        /state\.drawFailureReason = "robot-metadata-failed";/m,
    );
    assert.doesNotMatch(
        source,
        /maybePromise\.catch\(\(\) => null\)/m,
    );
});
