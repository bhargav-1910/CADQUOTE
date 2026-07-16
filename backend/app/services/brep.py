"""B-rep feature recognition for STEP files.

Reads the exact boundary representation with OpenCASCADE (via the optional
`cadquery-ocp` package) instead of relying on mesh heuristics:

- Holes: internal cylindrical faces grouped by axis+radius, with fitted
  diameter and depth. Partial internal radii (fillets) are excluded by
  requiring a (near) full circular sweep.
- Machining directions: distinct hole-axis clusters — the number of
  orientations the part must be presented to a 3-axis spindle to drill
  everything. This drives the setup count in pricing.

Everything degrades gracefully: if OCP is not installed or the file cannot
be parsed, callers get ``None`` and the mesh-based pipeline stands alone.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

try:  # pragma: no cover - import guard exercised implicitly
    from OCP.Bnd import Bnd_Box
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.BRepBndLib import BRepBndLib
    from OCP.BRepGProp import BRepGProp
    from OCP.BRepTools import BRepTools
    from OCP.GProp import GProp_GProps
    from OCP.GeomAbs import GeomAbs_Cylinder, GeomAbs_Plane
    from OCP.IFSelect import IFSelect_RetDone
    from OCP.STEPControl import STEPControl_Reader
    from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED, TopAbs_SOLID
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS

    OCP_AVAILABLE = True
except ImportError:  # pragma: no cover
    OCP_AVAILABLE = False

# A hole must sweep (close to) a full circle; internal corner fillets are
# quarter/half cylinders and must not count as drilled holes.
_FULL_SWEEP_RAD = 5.5  # ~315 deg out of 2*pi
_AXIS_CLUSTER_COS = math.cos(math.radians(10.0))
_MAX_HOLES = 200


@dataclass
class _CylGroup:
    """Cylindrical faces sharing one axis+radius (i.e. one physical hole)."""

    radius: float
    direction: Tuple[float, float, float]
    sweep_rad: float = 0.0
    depth: float = 0.0
    face_count: int = 0


@dataclass
class BRepFeatures:
    """Exact features recovered from the STEP boundary representation."""

    hole_count: int
    hole_diameters_mm: List[float]
    holes: List[Dict[str, Any]]
    machining_direction_count: int
    planar_normal_clusters: int
    face_count: int
    cylindrical_face_count: int
    planar_face_count: int
    # Exact mass properties (mm-based, from the solid model — trustworthy
    # even when the tessellated mesh is open or self-intersecting).
    volume_mm3: float = 0.0
    surface_area_mm2: float = 0.0
    bbox_mm: Tuple[float, float, float] = (0.0, 0.0, 0.0)
    # Distinct solid bodies in the file: >1 means an assembly was uploaded,
    # which cannot be quoted as a single machined part.
    solid_count: int = 1

    def as_analysis_fields(self) -> Dict[str, Any]:
        """Keys merged into the geometry-analysis payload."""
        return {
            "hole_count": self.hole_count,
            "hole_diameters_mm": self.hole_diameters_mm or None,
            "machining_direction_count": self.machining_direction_count,
            "brep_hole_data": self.holes or None,
            "solid_count": self.solid_count,
        }


def _fold_direction(x: float, y: float, z: float) -> Tuple[float, float, float]:
    """Canonicalize an undirected axis so +d and -d compare equal."""
    for component in (x, y, z):
        if abs(component) > 1e-9:
            if component < 0:
                return (-x, -y, -z)
            break
    return (x, y, z)


def _cluster_directions(directions: List[Tuple[float, float, float]]) -> int:
    """Count distinct undirected directions (10 degree tolerance)."""
    clusters: List[Tuple[float, float, float]] = []
    for d in directions:
        if not any(abs(d[0] * c[0] + d[1] * c[1] + d[2] * c[2]) >= _AXIS_CLUSTER_COS for c in clusters):
            clusters.append(d)
    return len(clusters)


def _read_step_shape(file_path: str):
    reader = STEPControl_Reader()
    if reader.ReadFile(file_path) != IFSelect_RetDone:
        raise ValueError("STEP reader could not parse the file")
    reader.TransferRoots()
    shape = reader.OneShape()
    if shape is None or shape.IsNull():
        raise ValueError("STEP file contains no transferable shape")
    return shape


def _face_area(face) -> float:
    props = GProp_GProps()
    BRepGProp.SurfaceProperties_s(face, props)
    return float(props.Mass())


def analyze_step_brep(file_path: str) -> Optional[BRepFeatures]:
    """Extract exact hole and orientation features from a STEP file.

    Returns ``None`` when OCP is unavailable or the file cannot be analyzed,
    so the mesh pipeline can proceed unchanged.
    """
    if not OCP_AVAILABLE:
        return None

    try:
        shape = _read_step_shape(file_path)

        # Exact mass properties from the solid model. The STEP reader
        # normalizes units to mm, so these are unit-safe regardless of the
        # file's declared unit (unlike the mesh pipeline's mm assumption).
        volume_props = GProp_GProps()
        BRepGProp.VolumeProperties_s(shape, volume_props)
        volume_mm3 = abs(float(volume_props.Mass()))

        surface_props = GProp_GProps()
        BRepGProp.SurfaceProperties_s(shape, surface_props)
        surface_area_mm2 = abs(float(surface_props.Mass()))

        box = Bnd_Box()
        BRepBndLib.Add_s(shape, box)
        xmin, ymin, zmin, xmax, ymax, zmax = box.Get()
        bbox_mm = (float(xmax - xmin), float(ymax - ymin), float(zmax - zmin))

        solid_count = 0
        solid_explorer = TopExp_Explorer(shape, TopAbs_SOLID)
        while solid_explorer.More():
            solid_count += 1
            solid_explorer.Next()
        solid_count = max(solid_count, 1)

        cyl_groups: Dict[Tuple, _CylGroup] = {}
        planar_normals: List[Tuple[Tuple[float, float, float], float]] = []
        face_count = 0
        cylindrical_face_count = 0
        planar_face_count = 0

        explorer = TopExp_Explorer(shape, TopAbs_FACE)
        while explorer.More():
            face = TopoDS.Face_s(explorer.Current())
            explorer.Next()
            face_count += 1

            adaptor = BRepAdaptor_Surface(face)
            surface_type = adaptor.GetType()

            if surface_type == GeomAbs_Cylinder:
                cylindrical_face_count += 1
                # An internal cylindrical face (hole wall) has its outward
                # normal flipped relative to the surface's natural normal.
                if face.Orientation() != TopAbs_REVERSED:
                    continue

                cylinder = adaptor.Cylinder()
                radius = float(cylinder.Radius())
                axis = cylinder.Axis()
                loc = axis.Location()
                direction = axis.Direction()
                dx, dy, dz = float(direction.X()), float(direction.Y()), float(direction.Z())
                folded = _fold_direction(dx, dy, dz)

                # Point on the axis closest to the origin — sign-invariant,
                # so both half-cylinders of one hole share a key.
                px, py, pz = float(loc.X()), float(loc.Y()), float(loc.Z())
                dot = px * dx + py * dy + pz * dz
                axis_point = (px - dot * dx, py - dot * dy, pz - dot * dz)

                key = (
                    round(folded[0], 3), round(folded[1], 3), round(folded[2], 3),
                    round(axis_point[0], 2), round(axis_point[1], 2), round(axis_point[2], 2),
                    round(radius, 2),
                )
                group = cyl_groups.setdefault(key, _CylGroup(radius=radius, direction=folded))

                try:
                    umin, umax, vmin, vmax = BRepTools.UVBounds_s(face)
                    group.sweep_rad += abs(umax - umin)
                    group.depth = max(group.depth, abs(vmax - vmin))
                except Exception:
                    # Without UV bounds, still count the face toward a sweep.
                    group.sweep_rad += math.pi
                group.face_count += 1

            elif surface_type == GeomAbs_Plane:
                planar_face_count += 1
                try:
                    plane = adaptor.Plane()
                    normal = plane.Axis().Direction()
                    planar_normals.append(
                        (
                            _fold_direction(float(normal.X()), float(normal.Y()), float(normal.Z())),
                            _face_area(face),
                        )
                    )
                except Exception:
                    continue

        holes: List[Dict[str, Any]] = []
        for group in cyl_groups.values():
            if group.sweep_rad < _FULL_SWEEP_RAD:
                continue  # partial internal radius, not a drilled/bored hole
            holes.append(
                {
                    "diameter_mm": round(group.radius * 2.0, 2),
                    "depth_mm": round(group.depth, 2),
                    "axis": [round(c, 4) for c in group.direction],
                }
            )
        holes.sort(key=lambda h: h["diameter_mm"])
        holes = holes[:_MAX_HOLES]

        hole_axes = [tuple(h["axis"]) for h in holes]
        hole_direction_count = max(1, _cluster_directions(hole_axes)) if hole_axes else 1

        significant_area = sum(area for _, area in planar_normals) * 0.01
        planar_clusters = _cluster_directions(
            [d for d, area in planar_normals if area >= significant_area]
        )

        # Orientations the part must be presented to the spindle: holes give
        # a hard lower bound, but milled faces need presenting too. A plain
        # block has ~3 folded planar clusters yet machines in 1-2 setups, so
        # discount the planar count by the two clusters any billet's opposed
        # faces contribute for free.
        machining_direction_count = min(
            12, max(hole_direction_count, planar_clusters - 2, 1)
        )

        return BRepFeatures(
            hole_count=len(holes),
            hole_diameters_mm=[h["diameter_mm"] for h in holes],
            holes=holes,
            machining_direction_count=machining_direction_count,
            planar_normal_clusters=planar_clusters,
            face_count=face_count,
            cylindrical_face_count=cylindrical_face_count,
            planar_face_count=planar_face_count,
            volume_mm3=volume_mm3,
            surface_area_mm2=surface_area_mm2,
            bbox_mm=bbox_mm,
            solid_count=solid_count,
        )
    except Exception as exc:
        logger.warning("B-rep analysis failed for %s: %s", file_path, exc)
        return None
