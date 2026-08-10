/**
 * Client-side CAD geometry loading.
 *
 * STEP files are tessellated exactly in the browser with occt-import-js
 * (OpenCascade compiled to WASM — the same kernel the backend uses via
 * cascadio). STL and GLB blobs are parsed with three.js loaders. All paths
 * return the same shape list so the viewer has one rendering pipeline.
 */
import * as THREE from 'three';
import { STLLoader, GLTFLoader } from 'three-stdlib';

export interface ParsedShape {
  geometry: THREE.BufferGeometry;
  color: THREE.Color | null;
}

let occtPromise: Promise<any> | null = null;

/** Lazy-load the OCCT WASM module once; it is ~large so only fetch on demand. */
const initOcct = (): Promise<any> => {
  if (!occtPromise) {
    occtPromise = (async () => {
      const [{ default: occtimportjs }, { default: wasmUrl }] = await Promise.all([
        import('occt-import-js'),
        import('occt-import-js/dist/occt-import-js.wasm?url'),
      ]);
      return occtimportjs({
        locateFile: (file: string) => (file.endsWith('.wasm') ? wasmUrl : file),
      });
    })().catch((error) => {
      // Allow a retry on transient failures instead of caching the rejection.
      occtPromise = null;
      throw error;
    });
  }
  return occtPromise;
};

/** Parse a raw STEP file buffer into exact tessellated shapes. */
export const parseStepBuffer = async (buffer: ArrayBuffer): Promise<ParsedShape[]> => {
  const occt = await initOcct();
  const result = occt.ReadStepFile(new Uint8Array(buffer), null);
  if (!result?.success || !result.meshes?.length) {
    throw new Error('OCCT could not parse the STEP file');
  }

  return result.meshes.map((mesh: any) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3),
    );
    if (mesh.attributes.normal) {
      geometry.setAttribute(
        'normal',
        new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3),
      );
    }
    geometry.setIndex(new THREE.Uint32BufferAttribute(mesh.index.array, 1));
    if (!mesh.attributes.normal) {
      geometry.computeVertexNormals();
    }

    const color = Array.isArray(mesh.color)
      ? new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2])
      : null;
    return { geometry, color };
  });
};

/** Parse an STL blob into a single shape. */
export const parseStlBuffer = (buffer: ArrayBuffer): ParsedShape[] => {
  const geometry = new STLLoader().parse(buffer);
  geometry.computeVertexNormals();
  return [{ geometry, color: null }];
};

/** glTF's base unit is meters (spec section 3.7.1.1); the rest of this app's
 * client-side pipeline (dimensions, wall-thickness raycasting) assumes file
 * units are mm, matching the backend. Without this, a 155 mm part reads as
 * "0.2 mm" and thickness raycasts operate at the wrong epsilon scale. */
const GLB_METERS_TO_MM = 1000;

/** Parse a GLB blob (backend STEP conversion fallback) into flat shapes. */
export const parseGlbBuffer = (buffer: ArrayBuffer): Promise<ParsedShape[]> =>
  new Promise((resolve, reject) => {
    new GLTFLoader().parse(
      buffer,
      '',
      (gltf) => {
        const shapes: ParsedShape[] = [];
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh && child.geometry) {
            const geometry = child.geometry.clone() as THREE.BufferGeometry;
            geometry.applyMatrix4(child.matrixWorld);
            geometry.scale(GLB_METERS_TO_MM, GLB_METERS_TO_MM, GLB_METERS_TO_MM);
            if (!geometry.getAttribute('normal')) {
              geometry.computeVertexNormals();
            }
            const material = Array.isArray(child.material) ? child.material[0] : child.material;
            const color =
              material && 'color' in material && material.color instanceof THREE.Color
                ? material.color.clone()
                : null;
            shapes.push({ geometry, color });
          }
        });
        if (shapes.length === 0) {
          reject(new Error('GLB preview contains no meshes'));
          return;
        }
        resolve(shapes);
      },
      (error) => reject(error instanceof Error ? error : new Error('Failed to parse GLB preview')),
    );
  });

export const disposeShapes = (shapes: ParsedShape[]): void => {
  shapes.forEach((shape) => shape.geometry.dispose());
};

export interface MeshStats {
  volumeMm3: number;
  surfaceAreaMm2: number;
  triangleCount: number;
}

/**
 * Volume (signed tetrahedron sum) and surface area straight from the mesh,
 * in file units (mm). Used as a fallback when no backend analysis is loaded.
 */
export const computeMeshStats = (shapes: ParsedShape[]): MeshStats => {
  let volume = 0;
  let area = 0;
  let triangleCount = 0;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const crossProduct = new THREE.Vector3();

  for (const shape of shapes) {
    const position = shape.geometry.getAttribute('position');
    const index = shape.geometry.getIndex();
    const count = index ? index.count : position.count;
    triangleCount += count / 3;

    for (let i = 0; i < count; i += 3) {
      const ia = index ? index.getX(i) : i;
      const ib = index ? index.getX(i + 1) : i + 1;
      const ic = index ? index.getX(i + 2) : i + 2;
      a.fromBufferAttribute(position, ia);
      b.fromBufferAttribute(position, ib);
      c.fromBufferAttribute(position, ic);

      volume += a.dot(crossProduct.copy(b).cross(c)) / 6;
      area += ab.copy(b).sub(a).cross(ac.copy(c).sub(a)).length() / 2;
    }
  }

  return {
    volumeMm3: Math.abs(volume),
    surfaceAreaMm2: area,
    triangleCount: Math.round(triangleCount),
  };
};

// ---------------------------------------------------------------------------
// DFM wall-thickness heatmap
// ---------------------------------------------------------------------------

/** Thickness (mm, assuming file units are mm) → RGB color stops. */
const thicknessColor = (thickness: number): [number, number, number] => {
  if (thickness < 1.5) return [0.94, 0.27, 0.27]; // red — critical
  if (thickness < 2.5) return [0.98, 0.57, 0.24]; // orange — thin
  if (thickness < 4.0) return [0.99, 0.86, 0.37]; // yellow — near limit
  return [0.55, 0.65, 0.78]; // steel — healthy
};

/**
 * Build vertex-colored copies of the shapes where each face is tinted by the
 * local wall thickness, measured by casting a ray inward from the face
 * centroid to the opposite wall (BVH-accelerated, same idea as the backend's
 * DFM sampling but exhaustive).
 */
export const computeThicknessHeatmap = async (shapes: ParsedShape[]): Promise<ParsedShape[]> => {
  const { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } = await import('three-mesh-bvh');
  (THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
  (THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
  (THREE.Mesh.prototype as any).raycast = acceleratedRaycast;

  // firstHitOnly stays off: the tessellation seams between adjacent B-rep
  // faces produce near-coincident triangles right at the ray origin, so the
  // "first" hit is often a self-intersection a few microns away rather than
  // the true opposite wall. We need the full sorted hit list to skip those.
  const raycaster = new THREE.Raycaster();

  const results: ParsedShape[] = [];

  for (const shape of shapes) {
    const geometry = shape.geometry.toNonIndexed();
    (geometry as any).computeBoundsTree();
    const probeMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));

    const positions = geometry.getAttribute('position');
    const faceCount = positions.count / 3;
    const colors = new Float32Array(positions.count * 3);

    // Cap the ray budget on very dense meshes; skipped faces inherit the
    // color of the previous measured face (block coloring).
    const maxRays = 60000;
    const stride = Math.max(1, Math.ceil(faceCount / maxRays));

    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const centroid = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const edge1 = new THREE.Vector3();
    const edge2 = new THREE.Vector3();
    const epsilon = 1e-3;
    // Hits closer than this are almost always the seam between two adjacent
    // B-rep faces meeting at the ray origin, not a real opposite wall.
    const minValidHitDistance = 0.05;

    let lastColor: [number, number, number] = [0.55, 0.65, 0.78];

    for (let face = 0; face < faceCount; face += 1) {
      if (face % stride === 0) {
        a.fromBufferAttribute(positions, face * 3);
        b.fromBufferAttribute(positions, face * 3 + 1);
        c.fromBufferAttribute(positions, face * 3 + 2);
        centroid.copy(a).add(b).add(c).divideScalar(3);
        edge1.copy(b).sub(a);
        edge2.copy(c).sub(a);
        normal.copy(edge1).cross(edge2).normalize();

        // Cast inward: from just inside the surface, opposite the normal.
        raycaster.set(
          centroid.clone().addScaledVector(normal, -epsilon),
          normal.clone().negate(),
        );
        const hits = raycaster.intersectObject(probeMesh, false);
        // three.js sorts intersectObject results by ascending distance —
        // take the first hit that clears the seam-noise threshold.
        const realHit = hits.find((hit) => hit.distance > minValidHitDistance);
        const thickness = realHit ? realHit.distance + epsilon : Infinity;
        lastColor = thicknessColor(thickness);
      }

      for (let vertex = 0; vertex < 3; vertex += 1) {
        const offset = (face * 3 + vertex) * 3;
        colors[offset] = lastColor[0];
        colors[offset + 1] = lastColor[1];
        colors[offset + 2] = lastColor[2];
      }

      // Yield periodically so huge meshes don't freeze the UI thread.
      if (face > 0 && face % 20000 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    (geometry as any).disposeBoundsTree();
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    results.push({ geometry, color: null });
  }

  return results;
};
