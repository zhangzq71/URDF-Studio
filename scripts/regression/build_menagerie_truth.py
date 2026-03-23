#!/usr/bin/env python3
"""Build a MuJoCo menagerie truth manifest with per-body and per-joint facts."""

from __future__ import annotations

import argparse
import json
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import mujoco


DEFAULT_MENAGERIE_ROOT = Path(".tmp/regression/mujoco_menagerie")
DEFAULT_OUTPUT_PATH = Path(".tmp/regression/menagerie_truth.json")
SKIP_MODEL_DIRS = {"assets", "test"}
JOINT_TYPE_NAMES = {
    int(mujoco.mjtJoint.mjJNT_FREE): "free",
    int(mujoco.mjtJoint.mjJNT_BALL): "ball",
    int(mujoco.mjtJoint.mjJNT_SLIDE): "slide",
    int(mujoco.mjtJoint.mjJNT_HINGE): "hinge",
}


@dataclass(frozen=True)
class BuildPaths:
    menagerie_root: Path
    output_path: Path


def parse_args() -> BuildPaths:
    parser = argparse.ArgumentParser(
        description=(
            "Compile top-level MJCF files from mujoco_menagerie and emit a "
            "truth manifest for URDF Studio regression checks."
        )
    )
    parser.add_argument(
        "--menagerie-root",
        type=Path,
        default=DEFAULT_MENAGERIE_ROOT,
        help="Path to the cloned mujoco_menagerie repository.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Where to write the JSON manifest.",
    )
    args = parser.parse_args()
    return BuildPaths(
        menagerie_root=args.menagerie_root.expanduser().resolve(),
        output_path=args.output.expanduser().resolve(),
    )


def iter_model_dirs(menagerie_root: Path) -> list[Path]:
    if not menagerie_root.is_dir():
        raise FileNotFoundError(f"Menagerie root does not exist: {menagerie_root}")

    model_dirs: list[Path] = []
    for child in sorted(menagerie_root.iterdir(), key=lambda path: path.name):
        if not child.is_dir():
            continue
        if child.name.startswith("."):
            continue
        if child.name in SKIP_MODEL_DIRS:
            continue
        model_dirs.append(child)
    return model_dirs


def iter_top_level_xmls(model_dir: Path) -> list[Path]:
    return sorted(
        (
            path
            for path in model_dir.iterdir()
            if path.is_file() and path.suffix.lower() == ".xml"
        ),
        key=lambda path: path.name,
    )


def json_number_list(values: Any) -> list[float]:
    return [float(value) for value in values]


def is_visual_geom(model: mujoco.MjModel, geom_id: int) -> bool:
    group = int(model.geom_group[geom_id])
    contype = int(model.geom_contype[geom_id])
    conaffinity = int(model.geom_conaffinity[geom_id])
    return group in (1, 2) or (contype == 0 and conaffinity == 0)


def joint_qpos0(model: mujoco.MjModel, joint_id: int) -> list[float]:
    qpos_start = int(model.jnt_qposadr[joint_id])
    if qpos_start < 0:
        return []

    qpos_end = int(model.nq)
    for next_joint_id in range(joint_id + 1, int(model.njnt)):
        next_qpos_start = int(model.jnt_qposadr[next_joint_id])
        if next_qpos_start > qpos_start:
            qpos_end = next_qpos_start
            break
    return json_number_list(model.qpos0[qpos_start:qpos_end])


def mj_name(model: mujoco.MjModel, obj_type: mujoco.mjtObj, obj_id: int, fallback: str) -> str:
    name = mujoco.mj_id2name(model, obj_type, obj_id)
    return name if name else fallback


def build_body_entries(model: mujoco.MjModel) -> list[dict[str, Any]]:
    bodies: list[dict[str, Any]] = []

    for body_id in range(int(model.nbody)):
        geom_adr = int(model.body_geomadr[body_id])
        geom_num = int(model.body_geomnum[body_id])

        visual_geom_count = 0
        collision_geom_count = 0
        if geom_adr >= 0 and geom_num > 0:
            for geom_id in range(geom_adr, geom_adr + geom_num):
                if is_visual_geom(model, geom_id):
                    visual_geom_count += 1
                else:
                    collision_geom_count += 1

        bodies.append(
            {
                "name": mj_name(model, mujoco.mjtObj.mjOBJ_BODY, body_id, f"body_{body_id}"),
                "mass": float(model.body_mass[body_id]),
                "ipos": json_number_list(model.body_ipos[body_id]),
                "inertia": json_number_list(model.body_inertia[body_id]),
                "geom_count": geom_num,
                "visual_geom_count": visual_geom_count,
                "collision_geom_count": collision_geom_count,
            }
        )

    return bodies


def build_joint_entries(model: mujoco.MjModel) -> list[dict[str, Any]]:
    joints: list[dict[str, Any]] = []

    for joint_id in range(int(model.njnt)):
        joint_type = int(model.jnt_type[joint_id])
        joints.append(
            {
                "name": mj_name(
                    model,
                    mujoco.mjtObj.mjOBJ_JOINT,
                    joint_id,
                    f"joint_{joint_id}",
                ),
                "type": JOINT_TYPE_NAMES.get(joint_type, f"unknown_{joint_type}"),
                "range": json_number_list(model.jnt_range[joint_id]),
                "axis": json_number_list(model.jnt_axis[joint_id]),
                "qpos0": joint_qpos0(model, joint_id),
            }
        )

    return joints


def compile_xml(xml_path: Path, menagerie_root: Path) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "model_dir": xml_path.parent.name,
        "xml_file": xml_path.name,
        "xml_relpath": str(xml_path.relative_to(menagerie_root)),
        "compile_ok": False,
        "error": None,
        "body_count": 0,
        "joint_count": 0,
        "geom_count": 0,
        "total_mass": 0.0,
        "per_body": [],
        "per_joint": [],
    }

    try:
        model = mujoco.MjModel.from_xml_path(str(xml_path))
    except Exception as exc:
        entry["error"] = f"{type(exc).__name__}: {exc}"
        return entry

    per_body = build_body_entries(model)
    per_joint = build_joint_entries(model)

    entry.update(
        {
            "compile_ok": True,
            "body_count": int(model.nbody),
            "joint_count": int(model.njnt),
            "geom_count": int(model.ngeom),
            "total_mass": float(sum(body["mass"] for body in per_body)),
            "per_body": per_body,
            "per_joint": per_joint,
        }
    )
    return entry


def build_manifest(paths: BuildPaths) -> dict[str, Any]:
    model_dirs = iter_model_dirs(paths.menagerie_root)
    entries: list[dict[str, Any]] = []

    for model_dir in model_dirs:
        for xml_path in iter_top_level_xmls(model_dir):
            entries.append(compile_xml(xml_path.resolve(), paths.menagerie_root))

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generator": "scripts/regression/build_menagerie_truth.py",
        "menagerie_root": str(paths.menagerie_root),
        "model_dir_count": len(model_dirs),
        "entry_count": len(entries),
        "compile_ok_count": sum(1 for entry in entries if entry["compile_ok"]),
        "compile_error_count": sum(1 for entry in entries if not entry["compile_ok"]),
        "entries": entries,
    }


def write_manifest(output_path: Path, manifest: dict[str, Any]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=output_path.parent,
        delete=False,
        prefix=f"{output_path.name}.",
        suffix=".tmp",
    ) as handle:
        json.dump(manifest, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
        temp_path = Path(handle.name)
    temp_path.replace(output_path)


def main() -> int:
    paths = parse_args()
    manifest = build_manifest(paths)
    write_manifest(paths.output_path, manifest)
    print(
        "Wrote "
        f"{manifest['entry_count']} entries "
        f"({manifest['compile_ok_count']} compiled, "
        f"{manifest['compile_error_count']} failed) "
        f"to {paths.output_path}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
