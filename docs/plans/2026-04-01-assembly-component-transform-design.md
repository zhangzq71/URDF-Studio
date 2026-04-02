# Assembly Component Transform Design

**Date:** 2026-04-01

**Goal:** In workspace/pro mode, selecting a top-level assembly component should show a transform gizmo that moves the whole component, while link/joint-level transform gizmos stay disabled inside that assembly context.

**Problem**

- The tree can display assembly components, but clicking a component row does not establish a component-level transform target.
- The visualizer already contains [`AssemblyTransformControls`](/home/xyk/Desktop/URDF-Studio/src/features/visualizer/components/controls/AssemblyTransformControls.tsx), but it is not rendered by [`VisualizerScene`](/home/xyk/Desktop/URDF-Studio/src/features/visualizer/components/VisualizerScene.tsx).
- Joint transform controls remain enabled in merged assembly workspace, which conflicts with the requested “move the component as a whole, not individual internal links/joints” behavior.

**Chosen Approach**

1. Use `assemblySelectionStore` as the source of truth for assembly-level selection.
2. Update the assembly tree so clicking a component row selects that component instead of only toggling expand/collapse.
3. Render the existing `AssemblyTransformControls` from `VisualizerScene`.
4. Disable joint transform gizmos whenever the visualizer is rendering an assembly workspace, while leaving normal selection/inspection intact.

**Why This Approach**

- Reuses the existing component/assembly transform persistence path via `onComponentTransform` and `updateComponentTransform`.
- Avoids inventing a parallel gizmo state model in `app/`.
- Keeps collision transform behavior unchanged.
- Limits the blast radius to tree selection wiring and visualizer control rendering.

**Behavior**

- Clicking `g1_dual_arm`, `b2_description`, or `calf` in the workspace tree selects that component.
- The selected component shows a transform gizmo in the visualizer.
- Dragging the gizmo updates that component’s assembly transform.
- Internal links/joints may still be selected for inspection, but they do not show transform controls in assembly workspace mode.
- Component expand/collapse remains available through the chevron control.

**Files Expected**

- [`src/features/robot-tree/components/AssemblyTreeView.tsx`](/home/xyk/Desktop/URDF-Studio/src/features/robot-tree/components/AssemblyTreeView.tsx)
- [`src/features/visualizer/components/VisualizerScene.tsx`](/home/xyk/Desktop/URDF-Studio/src/features/visualizer/components/VisualizerScene.tsx)
- [`src/features/visualizer/hooks/useVisualizerController.ts`](/home/xyk/Desktop/URDF-Studio/src/features/visualizer/hooks/useVisualizerController.ts)
- [`src/features/visualizer/components/controls/AssemblyTransformControls.tsx`](/home/xyk/Desktop/URDF-Studio/src/features/visualizer/components/controls/AssemblyTransformControls.tsx) if any behavior gap appears
- Tests near the affected feature files
