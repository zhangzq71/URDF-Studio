# URDF Spec Baseline and Parser Gap Notes

Last reviewed: 2026-03-31

This note distills the legacy ROS URDF wiki pages into a repo-local baseline that can be reused for:

- AI inspection prompts and scoring
- code review and parser support audits
- separating core URDF semantics from consumer-specific extensions

## Source Pages Reviewed

The canonical `wiki.ros.org` pages are currently fronted by Anubis, so the mirrored copies were used for extraction:

- `https://ftp.osuosl.org/pub/ros/ros_wiki_mirror/urdf%282f%29XML.html`
- `https://ftp.osuosl.org/pub/ros/ros_wiki_mirror/urdf%282f%29model.html`
- `https://ftp.osuosl.org/pub/ros/ros_wiki_mirror/urdf%282f%29XML%282f%29robot.html`
- `https://ftp.osuosl.org/pub/ros/ros_wiki_mirror/urdf%282f%29XML%282f%29link.html`
- `https://ftp.osuosl.org/pub/ros/ros_wiki_mirror/urdf%282f%29XML%282f%29joint.html`
- `https://ftp.osuosl.org/pub/ros/ros_wiki_mirror/urdf%282f%29XML%282f%29transmission.html`
- `https://ftp.osuosl.org/pub/ros/ros_wiki_mirror/urdf%282f%29XML%282f%29gazebo.html`
- `https://ftp.osuosl.org/pub/ros/ros_wiki_mirror/urdf%282f%29XML%282f%29sensor.html`
- `https://ftp.osuosl.org/pub/ros/ros_wiki_mirror/urdf%282f%29XML%282f%29sensor%282f%29proposals.html`
- `https://ftp.osuosl.org/pub/ros/ros_wiki_mirror/urdf%282f%29XML%282f%29model_state.html`

Cross-check in repo:

- Local XSD: `src/features/code-editor/resources/urdf.xsd`
- Runtime parser: `src/core/parsers/urdf/parser/*`
- Runtime scene loader: `src/core/parsers/urdf/loader/URDFLoader.ts`
- Editor validation layer: `src/features/code-editor/utils/urdfValidation.ts`

## Distilled Core Baseline

### 1. Model assumptions

- Core URDF describes a rigid-body tree.
- It is not a native closed-loop / parallel-robot graph format.
- It focuses on kinematics, dynamics, visuals, and collisions.
- Many downstream ecosystems add extensions, but those are not interchangeable with core URDF.

### 2. Root contract

- The root element is `<robot>`.
- `name` is required for a real robot document.
- Typical top-level children are:
  - core: `link`, `joint`, `material`
  - extensions: `transmission`, `gazebo`, `sensor`

### 3. Link contract

- Every `<link>` must have `name`.
- Optional children:
  - `inertial`
  - one or more `visual`
  - one or more `collision`
- `visual` and `collision` are unions: multiple entries all count.
- Geometry on the legacy wiki baseline is one of:
  - `box`
  - `cylinder`
  - `sphere`
  - `mesh`
- Materials can be:
  - top-level named materials
  - inline per-visual materials with `color` and/or `texture`
- Collision geometry should usually be simplified rather than copied from high-resolution visual meshes.

### 4. Joint contract

- Every `<joint>` must have:
  - `name`
  - `type`
  - `<parent link="...">`
  - `<child link="...">`
- Legacy URDF joint types:
  - `revolute`
  - `continuous`
  - `prismatic`
  - `fixed`
  - `floating`
  - `planar`
- Optional children include:
  - `origin`
  - `axis`
  - `calibration`
  - `dynamics`
  - `limit`
  - `mimic`
  - `safety_controller`
- Important semantic rules:
  - `fixed` does not need axis/limit/dynamics/calibration/safety.
  - `axis` defaults to `(1, 0, 0)` if omitted in a consumer that applies defaults.
  - `continuous` joints carry `effort` and `velocity`, but do not use lower/upper position bounds.
  - `mimic` references another joint with `value = multiplier * source + offset`.

### 5. Extension surfaces

- `transmission` is a ROS control extension mapping joints and actuators.
- `gazebo` is an extension surface for Gazebo-specific behavior.
- `sensor` exists on the wiki, but historical notes explicitly say it was not widely adopted in practice.
- `sensor/proposals` is proposal-level material rather than a stable core baseline.
- `model_state` is historical / work-in-progress material, not a safe baseline for parser completeness claims.

## AI Inspection Baseline

When AI inspection is intended to enforce URDF correctness instead of only engineering taste, treat the following as the minimum spec layer:

### `spec.robot_root_contract`

- Check for a valid `<robot>` root and a stable `name`.
- Flag undocumented top-level extensions.

### `spec.link_joint_required_fields`

- Check required `name`, `type`, `parent`, and `child`.
- Flag missing references or references to nonexistent links.

### `spec.topology_tree_constraint`

- Check for a single root.
- Flag orphan links, duplicate child ownership, and closed loops in plain URDF.

### `spec.joint_semantics`

- Check that axis/limit/mimic/calibration usage matches the joint type.
- Flag contradictory `continuous` position bounds or broken mimic targets.

### `spec.extension_compatibility`

- Distinguish core URDF from `transmission`, `gazebo`, `sensor`, and custom extensions.
- Flag files whose correctness depends on undocumented consumer-specific tags.

The engineering review categories already present in the app remain useful, but they should be treated as a second layer after spec compliance, not as a replacement for it.

## URDF-Studio Support Matrix

### A. Code editor validation

Strengths:

- Schema-aware validation already checks:
  - unknown elements
  - unknown attributes
  - required attributes
  - enum values
- This path uses `src/features/code-editor/resources/urdf.xsd`, which is richer than the parser state model.

Important nuance:

- The local XSD is a superset of the old ROS wiki baseline.
- It includes things like `capsule`, `quat_xyzw`, `collision/verbose`, `link@type`, `sensor`, `transmission`, and open `gazebo` content.
- Validation success therefore means “accepted by this repo XSD”, not necessarily “portable across all URDF consumers”.

### B. `parseURDF` logical parser

Currently supported well:

- `<robot name="...">`
- robot `version`
- top-level named materials
- links, including `link@type`
- inertial blocks, visuals, collisions
- multiple `visual` and multiple `collision` entries
- visual / collision `name`
- collision `verbose` child metadata
- `origin quat_xyzw`, preserved as authored metadata while deriving compatible `rpy`
- geometry: `box`, `cylinder`, `sphere`, `mesh`, repo extension `capsule`
- named and inline material colors/textures
- basic Gazebo material override mapping
- joint types, origin, axis, limit, dynamics, mimic
- custom `<hardware>` extension
- full joint `calibration` (`reference_position`, `rising`, `falling`)
- `safety_controller`

Partial support:

- Gazebo: only a narrow material-color override path is modeled
- materials: runtime parser understands the repo visual model, not the full space of consumer-specific material extensions

Missing from the logical parser state model:

- typed `sensor` subtree
- typed `transmission` subtree
- full Gazebo extension content
- proposal-only sensor families from `sensor/proposals`

### C. Runtime URDF loader

Current behavior:

- Focused on scene/runtime loading, visuals, collisions, mimic, and mesh handling.
- Not a full metadata-preserving DOM model.
- `useRobotLoader` strips `<transmission>` blocks before loading to avoid runtime issues.

Implication:

- “Viewer loads it” does not mean the document is fully preserved as structured URDF semantics.

## Highest-Value Remaining Parser Gaps

If parser completeness is the goal, these are the next gaps worth addressing in order:

1. typed `transmission` model
2. typed `sensor` model
3. richer Gazebo extension strategy
4. proposal-only sensor families and other extension-only metadata

Recommended sequencing:

- First add fields that already have clean homes in the type system.
- Then add fields that are portable across exporters/importers.
- Leave consumer-specific extension trees for dedicated typed adapters instead of inflating the base robot state casually.

## Practical Review Rule

For this repo, URDF review should be split into two explicit layers:

1. Spec compliance
   - “Is this valid, portable, and semantically honest URDF?”
2. Engineering quality
   - “Is this robot physically plausible, maintainable, and appropriate for downstream simulation/control?”

That split avoids a common failure mode where a file is physically plausible but structurally non-portable, or syntactically valid but semantically unsafe for downstream tooling.
