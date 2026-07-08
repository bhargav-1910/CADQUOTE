/**
 * Procedurally generated sample part for onboarding — a 60×40×12 mm L-bracket
 * emitted as a watertight binary STL, so new users can try the full quoting
 * flow without hunting for a CAD file.
 */

// L-profile outline (mm), counter-clockwise, with extra vertices at x=20 and
// y=15 so the wall quads share every triangulation vertex (keeps it watertight).
const OUTLINE: Array<[number, number]> = [
  [0, 0],
  [20, 0],
  [60, 0],
  [60, 15],
  [20, 15],
  [20, 40],
  [0, 40],
  [0, 15],
];

const THICKNESS = 12;

// The L face split into three rectangles, each as corner indices into OUTLINE.
const FACE_RECTS: Array<[number, number, number, number]> = [
  [0, 1, 4, 7], // (0,0)-(20,15)
  [1, 2, 3, 4], // (20,0)-(60,15)
  [7, 4, 5, 6], // (0,15)-(20,40)
];

type Vec3 = [number, number, number];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (v: Vec3): Vec3 => {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
};

export const createSamplePartFile = (): File => {
  const triangles: Array<[Vec3, Vec3, Vec3]> = [];

  const at = (index: number, z: number): Vec3 => {
    const [x, y] = OUTLINE[index];
    return [x, y, z];
  };

  // Top (z = THICKNESS, CCW as seen from +z) and bottom (z = 0, reversed).
  for (const [a, b, c, d] of FACE_RECTS) {
    triangles.push([at(a, THICKNESS), at(b, THICKNESS), at(c, THICKNESS)]);
    triangles.push([at(a, THICKNESS), at(c, THICKNESS), at(d, THICKNESS)]);
    triangles.push([at(a, 0), at(c, 0), at(b, 0)]);
    triangles.push([at(a, 0), at(d, 0), at(c, 0)]);
  }

  // Side walls, one quad per outline segment (outward-facing winding).
  for (let i = 0; i < OUTLINE.length; i += 1) {
    const j = (i + 1) % OUTLINE.length;
    triangles.push([at(i, 0), at(j, 0), at(j, THICKNESS)]);
    triangles.push([at(i, 0), at(j, THICKNESS), at(i, THICKNESS)]);
  }

  // Binary STL: 80-byte header, uint32 count, 50 bytes per triangle.
  const buffer = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(buffer);
  new Uint8Array(buffer, 0, 80).set(
    new TextEncoder().encode('ForgeQuote sample L-bracket 60x40x12mm').slice(0, 80),
  );
  view.setUint32(80, triangles.length, true);

  let offset = 84;
  for (const [a, b, c] of triangles) {
    const normal = normalize(cross(sub(b, a), sub(c, a)));
    for (const value of [...normal, ...a, ...b, ...c]) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }
    view.setUint16(offset, 0, true);
    offset += 2;
  }

  return new File([buffer], 'sample-l-bracket.stl', { type: 'model/stl' });
};
