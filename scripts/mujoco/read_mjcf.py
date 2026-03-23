# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "mujoco",
# ]
# ///

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

try:
    import mujoco as mj
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Missing dependency: mujoco\n"
        "Install it with: pip install mujoco"
    ) from exc

IN_TREE_KINDS = ("body", "frame", "joint", "geom", "site", "camera", "light")
SPEC_LIST_KINDS = (
    "actuator",
    "sensor",
    "tendon",
    "equality",
    "mesh",
    "material",
    "texture",
)

ATTRS_BY_KIND = {
    "body": [
        "pos",
        "euler",
        "quat",
        "mocap",
        "gravcomp",
        "mass",
        "explicitinertial",
        "ipos",
        "iquat",
        "inertia",
        "fullinertia",
        "childclass",
        "user",
    ],
    "frame": ["pos", "quat", "euler", "axisangle", "xyaxes", "zaxis", "user"],
    "joint": [
        "type",
        "pos",
        "axis",
        "range",
        "limited",
        "stiffness",
        "springref",
        "springdamper",
        "damping",
        "armature",
        "frictionloss",
        "margin",
        "actuatorfrcrange",
        "actuatorgravcomp",
        "user",
    ],
    "geom": [
        "type",
        "size",
        "pos",
        "euler",
        "quat",
        "fromto",
        "mass",
        "density",
        "rgba",
        "group",
        "priority",
        "contype",
        "conaffinity",
        "condim",
        "friction",
        "solmix",
        "solref",
        "solimp",
        "margin",
        "gap",
        "meshname",
        "material",
        "user",
    ],
    "site": [
        "type",
        "size",
        "pos",
        "quat",
        "fromto",
        "group",
        "rgba",
        "material",
        "user",
    ],
    "camera": [
        "mode",
        "pos",
        "quat",
        "fovy",
        "ipd",
        "resolution",
        "sensorsize",
        "principalpixel",
        "focal",
        "focalpixel",
        "user",
    ],
    "light": [
        "mode",
        "pos",
        "dir",
        "diffuse",
        "specular",
        "ambient",
        "attenuation",
        "cutoff",
        "exponent",
        "castshadow",
        "directional",
        "active",
        "user",
    ],
    "actuator": [
        "type",
        "joint",
        "jointinparent",
        "tendon",
        "site",
        "body",
        "cranksite",
        "slidersite",
        "refsite",
        "gear",
        "ctrllimited",
        "ctrlrange",
        "forcelimited",
        "forcerange",
        "actlimited",
        "actrange",
        "lengthrange",
        "kp",
        "kv",
        "dampratio",
        "timeconst",
        "biasprm",
        "gainprm",
        "dynprm",
        "user",
    ],
    "sensor": [
        "type",
        "objtype",
        "objname",
        "objid",
        "joint",
        "site",
        "body",
        "geom",
        "tendon",
        "actuator",
        "cutoff",
        "noise",
        "user",
    ],
    "tendon": [
        "group",
        "limited",
        "range",
        "width",
        "material",
        "rgba",
        "stiffness",
        "damping",
        "frictionloss",
        "margin",
        "springlength",
        "user",
    ],
    "equality": [
        "type",
        "active",
        "objtype",
        "name1",
        "name2",
        "solref",
        "solimp",
        "data",
    ],
    "mesh": ["file", "scale", "refpos", "refquat", "content_type"],
    "material": [
        "rgba",
        "emission",
        "specular",
        "shininess",
        "metallic",
        "roughness",
        "reflectance",
        "texrepeat",
        "texuniform",
        "texture",
    ],
    "texture": [
        "type",
        "builtin",
        "file",
        "gridsize",
        "gridlayout",
        "rgb1",
        "rgb2",
        "width",
        "height",
        "mark",
        "random",
    ],
}


def load_mjcf(path: str | Path) -> tuple[Path, mj.MjSpec, mj.MjModel]:
    file_path = Path(path).expanduser().resolve()
    if not file_path.is_file():
        raise FileNotFoundError(f"MJCF file not found: {file_path}")

    spec = mj.MjSpec.from_file(str(file_path))
    model = spec.compile()
    return file_path, spec, model


def _safe_getattr(obj: Any, name: str) -> Any:
    try:
        return getattr(obj, name)
    except Exception:
        return None


def _value_to_json(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if hasattr(value, "tolist"):
        return _value_to_json(value.tolist())
    if isinstance(value, (list, tuple)):
        return [_value_to_json(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _value_to_json(item) for key, item in value.items()}

    name = _safe_getattr(value, "name")
    if isinstance(name, str):
        return name

    enum_name = _safe_getattr(value, "name")
    if isinstance(enum_name, str):
        return enum_name

    try:
        return int(value)
    except Exception:
        pass

    try:
        return float(value)
    except Exception:
        pass

    try:
        return [_value_to_json(item) for item in list(value)]
    except Exception:
        return str(value)


def _clean_dict(value: Any) -> Any:
    if isinstance(value, dict):
        cleaned = {
            key: _clean_dict(item)
            for key, item in value.items()
            if item is not None
        }
        return {
            key: item
            for key, item in cleaned.items()
            if item is not None and item != [] and item != {}
        }
    if isinstance(value, list):
        return [item for item in (_clean_dict(item) for item in value) if item is not None]
    return value


def _names(elements: list[Any], limit: int) -> list[str]:
    names = [element.name for element in elements if _safe_getattr(element, "name")]
    return names[:limit]


def _collect_elements(spec: mj.MjSpec) -> dict[str, list[Any]]:
    world = spec.worldbody
    elements: dict[str, list[Any]] = {
        "body": [world, *world.find_all("body")],
        "frame": list(world.find_all("frame")),
        "joint": list(world.find_all("joint")),
        "geom": list(world.find_all("geom")),
        "site": list(world.find_all("site")),
        "camera": list(world.find_all("camera")),
        "light": list(world.find_all("light")),
    }

    plural_map = {
        "actuator": "actuators",
        "sensor": "sensors",
        "tendon": "tendons",
        "equality": "equalities",
        "mesh": "meshes",
        "material": "materials",
        "texture": "textures",
    }
    for kind, plural in plural_map.items():
        elements[kind] = list(_safe_getattr(spec, plural) or [])

    return elements


def _make_ref(kind: str, index: int, element: Any) -> dict[str, Any]:
    name = _safe_getattr(element, "name") or None
    stable_name = name or f"unnamed_{kind}_{index}"
    return {
        "id": f"{kind}:{index}:{stable_name}",
        "kind": kind,
        "index": index,
        "name": name,
    }


def _build_ref_maps(elements: dict[str, list[Any]]) -> tuple[dict[int, dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    refs_by_object_id: dict[int, dict[str, Any]] = {}
    refs_by_kind: dict[str, list[dict[str, Any]]] = {}
    for kind, items in elements.items():
        refs: list[dict[str, Any]] = []
        for index, element in enumerate(items):
            ref = _make_ref(kind, index, element)
            refs_by_object_id[id(element)] = ref
            refs.append(ref)
        refs_by_kind[kind] = refs
    return refs_by_object_id, refs_by_kind


def _parent_ref(element: Any, refs_by_object_id: dict[int, dict[str, Any]]) -> dict[str, Any] | None:
    parent = _safe_getattr(element, "parent")
    if parent is None:
        return None
    parent_ref = refs_by_object_id.get(id(parent))
    if not parent_ref:
        return None
    return {
        "id": parent_ref["id"],
        "kind": parent_ref["kind"],
        "name": parent_ref["name"],
    }


def _path_for(element: Any, refs_by_object_id: dict[int, dict[str, Any]]) -> list[str]:
    path: list[str] = []
    current = element
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        ref = refs_by_object_id.get(id(current))
        if ref is None:
            break
        path.append(ref["name"] or ref["id"])
        current = _safe_getattr(current, "parent")
    path.reverse()
    return path


def _extract_attrs(kind: str, element: Any) -> dict[str, Any]:
    attrs: dict[str, Any] = {}
    for attr_name in ATTRS_BY_KIND.get(kind, []):
        value = _value_to_json(_safe_getattr(element, attr_name))
        if value is not None and value != [] and value != {}:
            attrs[attr_name] = value
    return attrs


def _serialize_element(
    kind: str,
    element: Any,
    refs_by_object_id: dict[int, dict[str, Any]],
) -> dict[str, Any]:
    ref = refs_by_object_id[id(element)]
    record: dict[str, Any] = {
        "id": ref["id"],
        "kind": ref["kind"],
        "index": ref["index"],
        "name": ref["name"],
    }

    parent = _parent_ref(element, refs_by_object_id)
    if parent is not None:
        record["parent"] = parent

    if kind in {"body", "frame"}:
        record["path"] = _path_for(element, refs_by_object_id)

    attrs = _extract_attrs(kind, element)
    if attrs:
        record["attrs"] = attrs

    return _clean_dict(record)


def _compiled_counts(model: mj.MjModel) -> dict[str, int]:
    return {
        "bodies": model.nbody,
        "joints": model.njnt,
        "geoms": model.ngeom,
        "sites": model.nsite,
        "cameras": model.ncam,
        "lights": model.nlight,
        "meshes": model.nmesh,
        "materials": model.nmat,
        "textures": model.ntex,
        "actuators": model.nu,
    }


def _spec_counts(elements: dict[str, list[Any]]) -> dict[str, int]:
    return {
        "bodies": len(elements["body"]),
        "frames": len(elements["frame"]),
        "joints": len(elements["joint"]),
        "geoms": len(elements["geom"]),
        "sites": len(elements["site"]),
        "cameras": len(elements["camera"]),
        "lights": len(elements["light"]),
        "actuators": len(elements["actuator"]),
        "sensors": len(elements["sensor"]),
        "tendons": len(elements["tendon"]),
        "equalities": len(elements["equality"]),
        "meshes": len(elements["mesh"]),
        "materials": len(elements["material"]),
        "textures": len(elements["texture"]),
    }


def _compiler_export(spec: mj.MjSpec) -> dict[str, Any]:
    compiler = _safe_getattr(spec, "compiler")
    if compiler is None:
        return {}

    result: dict[str, Any] = {}
    angle = _value_to_json(_safe_getattr(compiler, "angle"))
    if angle is not None:
        result["angle"] = angle

    meshdir = _value_to_json(_safe_getattr(compiler, "meshdir"))
    if meshdir is not None:
        result["meshdir"] = meshdir

    texturedir = _value_to_json(_safe_getattr(compiler, "texturedir"))
    if texturedir is not None:
        result["texturedir"] = texturedir

    return result


def summarize_loaded_mjcf(
    file_path: Path,
    spec: mj.MjSpec,
    model: mj.MjModel,
    limit: int = 10,
) -> dict[str, Any]:
    elements = _collect_elements(spec)

    return {
        "schema": "urdf-studio.mjcf-inspector/summary-v1",
        "file": str(file_path),
        "model_name": spec.modelname or file_path.stem,
        "compiler": _compiler_export(spec),
        "counts": _compiled_counts(model),
        "spec_counts": _spec_counts(elements),
        "samples": {
            "bodies": _names(elements["body"][1:], limit),
            "joints": _names(elements["joint"], limit),
            "geoms": _names(elements["geom"], limit),
            "sites": _names(elements["site"], limit),
            "cameras": _names(elements["camera"], limit),
            "lights": _names(elements["light"], limit),
            "actuators": _names(elements["actuator"], limit),
            "sensors": _names(elements["sensor"], limit),
        },
    }


def _build_tree(
    spec: mj.MjSpec,
    refs_by_object_id: dict[int, dict[str, Any]],
    elements: dict[str, list[Any]],
) -> dict[str, Any]:
    children: dict[str, dict[str, list[Any]]] = defaultdict(
        lambda: {kind: [] for kind in IN_TREE_KINDS}
    )

    for kind in IN_TREE_KINDS:
        for element in elements[kind]:
            parent = _safe_getattr(element, "parent")
            if parent is None:
                continue
            parent_ref = refs_by_object_id.get(id(parent))
            if parent_ref is None:
                continue
            children[parent_ref["id"]][kind].append(element)

    def visit(node_kind: str, node: Any) -> dict[str, Any]:
        record = _serialize_element(node_kind, node, refs_by_object_id)
        node_children = children.get(record["id"], {kind: [] for kind in IN_TREE_KINDS})
        record["bodies"] = [visit("body", body) for body in node_children["body"]]
        record["frames"] = [visit("frame", frame) for frame in node_children["frame"]]
        record["joints"] = [
            _serialize_element("joint", joint, refs_by_object_id)
            for joint in node_children["joint"]
        ]
        record["geoms"] = [
            _serialize_element("geom", geom, refs_by_object_id)
            for geom in node_children["geom"]
        ]
        record["sites"] = [
            _serialize_element("site", site, refs_by_object_id)
            for site in node_children["site"]
        ]
        record["cameras"] = [
            _serialize_element("camera", camera, refs_by_object_id)
            for camera in node_children["camera"]
        ]
        record["lights"] = [
            _serialize_element("light", light, refs_by_object_id)
            for light in node_children["light"]
        ]
        return _clean_dict(record)

    return visit("body", spec.worldbody)


def build_tree_export(
    file_path: Path,
    spec: mj.MjSpec,
    model: mj.MjModel,
    limit: int = 10,
) -> dict[str, Any]:
    elements = _collect_elements(spec)
    refs_by_object_id, _ = _build_ref_maps(elements)
    return {
        "schema": "urdf-studio.mjcf-inspector/tree-v1",
        "file": str(file_path),
        "model_name": spec.modelname or file_path.stem,
        "compiler": _compiler_export(spec),
        "counts": _compiled_counts(model),
        "spec_counts": _spec_counts(elements),
        "samples": summarize_loaded_mjcf(file_path, spec, model, limit=limit)["samples"],
        "tree": _build_tree(spec, refs_by_object_id, elements),
    }


def build_full_export(
    file_path: Path,
    spec: mj.MjSpec,
    model: mj.MjModel,
    limit: int = 10,
) -> dict[str, Any]:
    elements = _collect_elements(spec)
    refs_by_object_id, _ = _build_ref_maps(elements)
    export = {
        "schema": "urdf-studio.mjcf-inspector/full-v1",
        "file": str(file_path),
        "model_name": spec.modelname or file_path.stem,
        "compiler": _compiler_export(spec),
        "counts": _compiled_counts(model),
        "spec_counts": _spec_counts(elements),
        "samples": summarize_loaded_mjcf(file_path, spec, model, limit=limit)["samples"],
        "tree": _build_tree(spec, refs_by_object_id, elements),
    }

    export["bodies"] = [
        _serialize_element("body", body, refs_by_object_id)
        for body in elements["body"]
    ]
    export["frames"] = [
        _serialize_element("frame", frame, refs_by_object_id)
        for frame in elements["frame"]
    ]
    for kind in ("joint", "geom", "site", "camera", "light"):
        export[f"{kind}s"] = [
            _serialize_element(kind, item, refs_by_object_id)
            for item in elements[kind]
        ]
    export["actuators"] = [
        _serialize_element("actuator", item, refs_by_object_id)
        for item in elements["actuator"]
    ]
    export["sensors"] = [
        _serialize_element("sensor", item, refs_by_object_id)
        for item in elements["sensor"]
    ]
    export["tendons"] = [
        _serialize_element("tendon", item, refs_by_object_id)
        for item in elements["tendon"]
    ]
    export["equalities"] = [
        _serialize_element("equality", item, refs_by_object_id)
        for item in elements["equality"]
    ]
    export["meshes"] = [
        _serialize_element("mesh", item, refs_by_object_id)
        for item in elements["mesh"]
    ]
    export["materials"] = [
        _serialize_element("material", item, refs_by_object_id)
        for item in elements["material"]
    ]
    export["textures"] = [
        _serialize_element("texture", item, refs_by_object_id)
        for item in elements["texture"]
    ]
    return export


def summarize_mjcf(path: str | Path, limit: int = 10) -> dict[str, Any]:
    file_path, spec, model = load_mjcf(path)
    return summarize_loaded_mjcf(file_path, spec, model, limit)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Read and inspect an MJCF file.")
    parser.add_argument("mjcf_path", help="Path to the MJCF/XML file")
    parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Maximum number of sample names shown per object type",
    )

    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument(
        "--json",
        action="store_true",
        help="Print summary as JSON",
    )
    mode_group.add_argument(
        "--tree-json",
        action="store_true",
        help="Print the kinematic tree as JSON",
    )
    mode_group.add_argument(
        "--full-json",
        action="store_true",
        help="Print a full structured export as JSON",
    )

    parser.add_argument(
        "--output",
        metavar="OUTPUT_PATH",
        help="Write JSON output to a file instead of stdout",
    )
    parser.add_argument(
        "--dump-xml",
        metavar="OUTPUT_PATH",
        help="Write the resolved MJCF XML generated by MjSpec.to_xml()",
    )
    return parser


def _write_json(payload: dict[str, Any], output_path: str | None) -> None:
    text = json.dumps(payload, indent=2, ensure_ascii=False, sort_keys=True)
    if output_path:
        target = Path(output_path).expanduser().resolve()
        target.write_text(text + "\n", encoding="utf-8")
        print(f"JSON written to: {target}")
    else:
        print(text)


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        file_path, spec, model = load_mjcf(args.mjcf_path)
        summary = summarize_loaded_mjcf(file_path, spec, model, limit=max(args.limit, 1))
    except Exception as exc:
        print(f"Failed to read MJCF: {exc}", file=sys.stderr)
        return 1

    if args.dump_xml:
        xml_output_path = Path(args.dump_xml).expanduser().resolve()
        xml_output_path.write_text(spec.to_xml(), encoding="utf-8")

    if args.full_json:
        _write_json(build_full_export(file_path, spec, model, limit=max(args.limit, 1)), args.output)
        if args.dump_xml:
            print(f"Resolved XML written to: {xml_output_path}")
        return 0

    if args.tree_json:
        _write_json(build_tree_export(file_path, spec, model, limit=max(args.limit, 1)), args.output)
        if args.dump_xml:
            print(f"Resolved XML written to: {xml_output_path}")
        return 0

    if args.json:
        _write_json(summary, args.output)
        if args.dump_xml:
            print(f"Resolved XML written to: {xml_output_path}")
        return 0

    print(f"File: {summary['file']}")
    print(f"Model: {summary['model_name']}")
    print("Counts:")
    for key, value in summary["counts"].items():
        print(f"  - {key}: {value}")

    print("Samples:")
    for key, value in summary["samples"].items():
        if value:
            print(f"  - {key}: {', '.join(value)}")

    if args.dump_xml:
        print(f"Resolved XML written to: {xml_output_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
