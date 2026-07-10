"""B-rep feature recognition tests.

These build a real STEP file with OpenCASCADE primitives and assert the
analyzer recovers exact hole diameters and machining directions. Skipped
automatically when the optional OCP dependency is not installed.
"""
import pytest

from app.services.brep import OCP_AVAILABLE, analyze_step_brep

pytestmark = pytest.mark.skipif(not OCP_AVAILABLE, reason="cadquery-ocp not installed")


@pytest.fixture(scope="module")
def two_hole_bracket_step(tmp_path_factory) -> str:
    """A 60x40x10 block: Ø6 hole from the top, Ø4 cross-hole from the side,
    plus one edge fillet that must NOT be mistaken for a hole."""
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
    from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet
    from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
    from OCP.STEPControl import STEPControl_StepModelType, STEPControl_Writer
    from OCP.TopAbs import TopAbs_EDGE
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt

    box = BRepPrimAPI_MakeBox(60.0, 40.0, 10.0).Shape()
    top_hole = BRepPrimAPI_MakeCylinder(
        gp_Ax2(gp_Pnt(15.0, 20.0, -1.0), gp_Dir(0.0, 0.0, 1.0)), 3.0, 12.0
    ).Shape()
    part = BRepAlgoAPI_Cut(box, top_hole).Shape()
    side_hole = BRepPrimAPI_MakeCylinder(
        gp_Ax2(gp_Pnt(-1.0, 20.0, 5.0), gp_Dir(1.0, 0.0, 0.0)), 2.0, 62.0
    ).Shape()
    part = BRepAlgoAPI_Cut(part, side_hole).Shape()

    fillet = BRepFilletAPI_MakeFillet(part)
    explorer = TopExp_Explorer(part, TopAbs_EDGE)
    fillet.Add(2.0, TopoDS.Edge_s(explorer.Current()))
    part = fillet.Shape()

    path = str(tmp_path_factory.mktemp("brep") / "bracket.step")
    writer = STEPControl_Writer()
    writer.Transfer(part, STEPControl_StepModelType.STEPControl_AsIs)
    writer.Write(path)
    return path


def test_detects_exact_hole_diameters(two_hole_bracket_step):
    features = analyze_step_brep(two_hole_bracket_step)
    assert features is not None
    assert features.hole_count == 2
    assert features.hole_diameters_mm == [4.0, 6.0]


def test_fillet_is_not_a_hole(two_hole_bracket_step):
    features = analyze_step_brep(two_hole_bracket_step)
    assert features is not None
    # The R2 edge fillet is a partial cylinder; only the two full-sweep
    # bores may be reported.
    assert all(h["diameter_mm"] in (4.0, 6.0) for h in features.holes)


def test_cross_holes_yield_two_machining_directions(two_hole_bracket_step):
    features = analyze_step_brep(two_hole_bracket_step)
    assert features is not None
    # Z-axis hole + X-axis hole => the part must be presented twice.
    assert features.machining_direction_count == 2


def test_unparseable_file_returns_none(tmp_path):
    bogus = tmp_path / "not_cad.step"
    bogus.write_bytes(b"this is not a STEP file")
    assert analyze_step_brep(str(bogus)) is None
