# Runtime Fallback Audit (2026-03-26)

Scope: `src/features/urdf-viewer/runtime/**` (read-only audit, no behavior changes in this pass)

Goal: identify fallback/swallow-error paths that can hide bugs by reporting a success-like state.

## P0 (should be fixed first)

1. `runtime/viewer/usd-loader.js` around `L725-L741`
- `HdWebSyncDriver` creation failure path sets `state.ready = true` and returns.
- Risk: load failure looks like load success.
- Recommendation: split status (`ready=false`, `error=...`) and only set `ready=true` on successful driver init.

2. `runtime/hydra/render-delegate/shared-basic.js` around `L61-L68`
- `wrapHydraCallbackObject` catches sync/async callback errors and returns `undefined`.
- Risk: callback failures are swallowed; upstream cannot fail fast.
- Recommendation: keep crash safety, but emit structured error state + strict mode option to rethrow.

## P1 (high impact)

3. `runtime/hydra/render-delegate/ThreeRenderDelegateCore.js` around `L1428-L1448`
- physics record fetch errors collapse to empty arrays.
- Risk: failure is indistinguishable from "no physics data".
- Recommendation: return error-tagged payload (`source:error`, `errorMessage`).

4. `runtime/hydra/render-delegate/ThreeRenderDelegateCore.js` around `L1739, L1818-L1825`
- URDF truth fetch uses `.catch(() => null)`.
- Risk: network/parse/not-found all collapse to null and hide root cause.
- Recommendation: cache/load `truthLoadErrorByStage` and surface it to UI/debug API.

5. `runtime/hydra/render-delegate/ThreeRenderDelegateMaterialOps.js` around `L1533-L1553`
- async stage resolve failure collapses to `null`.
- Risk: stage resolution failure appears as “not available yet”.
- Recommendation: keep fallback but store last resolve error and emit throttled error log.

6. `runtime/viewer/usd-loader.js` around `L939-L946`
- metadata warmup exception swallowed by empty catch.
- Risk: stage appears ready with silently missing metadata.
- Recommendation: persist `metadataWarmupError` and expose non-blocking warning.

## P2 (important correctness/observability)

7. `runtime/hydra/render-delegate/ThreeRenderDelegateInterface.js` around `L566-L578`
- texture async failure is swallowed while API returns `true`.
- Risk: caller sees success even when texture failed.
- Recommendation: return async result or provide explicit error callback/event.

8. `runtime/hydra/render-delegate/ThreeRenderDelegateMaterialOps.js` around `L1808-L1820`
- same pattern for snapshot texture assignment.
- Risk: silent visual degradation.
- Recommendation: same as above; add error counter.

9. `runtime/viewer/link-dynamics.js` multiple locations (`L540/L602/L642/L735`)
- catalog build errors swallowed.
- Risk: dynamics overlays disappear without visible failure.
- Recommendation: keep `lastCatalogBuildError` and surface once per rebuild cycle.

10. `runtime/viewer/robot-metadata.js` around `L218-L228`
- warmup failure falls back to cached snapshot silently.
- Risk: stale data masquerades as fresh.
- Recommendation: return stale marker (`stale=true`) plus error metadata.

## Suggested rollout for runtime (next phase)

1. Add `RuntimeErrorState` container (stage path + code + message + timestamp).
2. Replace empty catches with `recordRuntimeError(...)` + `console.error` on failure paths.
3. Avoid success-shaped state changes on failure (`ready=true` after failure).
4. Keep user-safe fallback, but require explicit `partial/stale/error` flags for every fallback branch.
