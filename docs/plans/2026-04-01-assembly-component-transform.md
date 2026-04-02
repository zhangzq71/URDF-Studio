# Assembly Component Transform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable component-level transform gizmos in workspace/pro mode so assembly components move as a whole and internal link/joint transform gizmos stay disabled.

**Architecture:** Reuse `assemblySelectionStore` for component selection, wire the tree UI to select components explicitly, and render the existing `AssemblyTransformControls` in `VisualizerScene`. Suppress joint transform controls when `VisualizerScene` is operating on an assembly workspace so component transforms remain the only move affordance.

**Tech Stack:** React 19, TypeScript 5.8, Zustand 5, Three.js/R3F, Vitest

---

### Task 1: Wire Workspace Component Selection

**Files:**
- Modify: `src/features/robot-tree/components/AssemblyTreeView.tsx`

**Step 1: Add assembly selection store usage**

- Read `useAssemblySelectionStore` in the tree component.
- Read current component selection state from the store.
- Use it to render a selected style on the active component row.

**Step 2: Separate row selection from expand/collapse**

- Keep the chevron button responsible for expand/collapse.
- Make the component row click select the component via `selectComponent(component.id)`.
- Clear hover/selection conflicts as needed without changing link/joint tree behavior.

**Step 3: Preserve component actions**

- Keep visibility toggle and delete actions functional.
- Prevent row action buttons from unintentionally changing selection.

**Step 4: Add/adjust a focused test if needed**

- Verify component row selection updates the assembly selection state.

### Task 2: Render Component Transform Gizmo

**Files:**
- Modify: `src/features/visualizer/components/VisualizerScene.tsx`

**Step 1: Extend scene props**

- Accept `assemblyState`, `assemblySelection`, `onAssemblyTransform`, `onComponentTransform`, and `onTransformPendingChange`.

**Step 2: Render existing assembly transform controls**

- Import `AssemblyTransformControls`.
- Mount it alongside the existing joint/collision controls.
- Pass the existing `robotRootRef`, `jointPivots`, `transformMode`, and transform callbacks through.

**Step 3: Keep collision transforms intact**

- Do not change the collision transform control branch.

### Task 3: Disable Joint Transform Gizmos In Assembly Workspace

**Files:**
- Modify: `src/features/visualizer/hooks/useVisualizerController.ts`
- Possibly modify: `src/features/visualizer/components/VisualizerScene.tsx`

**Step 1: Derive an assembly workspace flag**

- Treat `Boolean(assemblyState)` inside the merged workspace visualizer as the signal that only component-level transforms should be active.

**Step 2: Suppress joint transform control activation**

- Ensure `useTransformControls` is only armed for joints when not in assembly workspace.
- Keep hover, focus, and preview behavior otherwise unchanged.

**Step 3: Verify selection still works**

- Internal links/joints should remain selectable/inspectable, but no joint gizmo should render in assembly workspace.

### Task 4: Test The New Behavior

**Files:**
- Modify or create tests near:
  - `src/features/visualizer/components/`
  - `src/features/robot-tree/components/`

**Step 1: Add a tree selection test**

- Assert component row selection writes `{ type: 'component', id }` to `assemblySelectionStore`.

**Step 2: Add a visualizer control test**

- Assert assembly transform controls render for component selection.
- Assert joint transform controls are disabled when `assemblyState` is present.

### Task 5: Verify

**Step 1: Run targeted tests**

- Run the affected Vitest files.

**Step 2: Run a build-level verification if the affected tests pass**

- Run `npm run build`.

**Step 3: Review for regressions**

- Confirm no new dependency inversion or silent fallback was introduced.
