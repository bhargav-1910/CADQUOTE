import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  Environment,
  Lightformer,
  Grid,
  PerspectiveCamera,
  GizmoHelper,
  GizmoViewcube,
  Html,
  Line,
} from '@react-three/drei';
import * as THREE from 'three';
import {
  Maximize2,
  Camera,
  Loader2,
  RotateCw,
  Scissors,
  Box as BoxIcon,
  Grid3x3,
  Hexagon,
  Thermometer,
  Ruler,
  Boxes,
  Move3d,
  Info,
} from 'lucide-react';
import type { GeometryAnalysis } from '@/types';
import { fetchFilePreviewBlob, fetchFileDownloadBlob } from '@/services/api';
import {
  parseStepBuffer,
  parseStlBuffer,
  parseGlbBuffer,
  disposeShapes,
  computeThicknessHeatmap,
  computeMeshStats,
  type ParsedShape,
} from '@/services/cadGeometry';

interface ModelViewerProps {
  fileId: string;
  fileFormat: string;
  geometry?: GeometryAnalysis;
  /** Override the default fixed height (e.g. "h-full" inside a modal). */
  className?: string;
}

type DisplayMode = 'shaded' | 'wireframe';
type SectionAxis = 'x' | 'y' | 'z';
type ModelSource = 'exact-cad' | 'mesh' | null;

/** Normalized model max dimension in scene units. */
const MODEL_SIZE = 4;

const VIEW_PRESETS: Record<string, [number, number, number]> = {
  iso: [4.4, 3.4, 4.4],
  front: [0, 0, 6.5],
  top: [0, 6.5, 0.001],
  right: [6.5, 0, 0],
};

const AXIS_NORMALS: Record<SectionAxis, THREE.Vector3> = {
  x: new THREE.Vector3(-1, 0, 0),
  y: new THREE.Vector3(0, -1, 0),
  z: new THREE.Vector3(0, 0, -1),
};

/** Applies camera view presets; re-fires when `seq` changes. */
const ViewController = ({
  request,
}: {
  request: { position: [number, number, number]; seq: number } | null;
}) => {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as any;

  useEffect(() => {
    if (!request) return;
    camera.position.set(...request.position);
    camera.up.set(0, 1, 0);
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [request, camera, controls]);

  return null;
};

/** Normalization for a shape set: scene scale + centering offset. */
const computeNormalization = (shapes: ParsedShape[]) => {
  const box = new THREE.Box3();
  shapes.forEach((shape) => {
    shape.geometry.computeBoundingBox();
    if (shape.geometry.boundingBox) {
      box.union(shape.geometry.boundingBox);
    }
  });
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = MODEL_SIZE / maxDim;
  return { scale, offset: center.clone().multiplyScalar(-scale), center, size };
};

/** Wireframe bounding box with X/Y/Z edge dimension labels (file units mm).
 * The wireframe itself is drawn from the mesh (it has to align with what's
 * rendered), but the printed numbers prefer the backend's exact B-rep
 * bounding box — the tessellated mesh can undershoot slightly on curved
 * edges, which read as a "wrong" dimension next to Part Info's number. */
const BoundingBoxOverlay = ({ shapes, geometry }: { shapes: ParsedShape[]; geometry?: GeometryAnalysis }) => {
  const { scale, offset, center, size } = useMemo(() => computeNormalization(shapes), [shapes]);

  const edgesGeometry = useMemo(() => {
    const box = new THREE.BoxGeometry(size.x, size.y, size.z);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [size]);

  useEffect(() => () => edgesGeometry.dispose(), [edgesGeometry]);

  const min = center.clone().sub(size.clone().multiplyScalar(0.5));
  const max = center.clone().add(size.clone().multiplyScalar(0.5));

  const labelSize = geometry
    ? { x: geometry.bounding_box.x * 10, y: geometry.bounding_box.y * 10, z: geometry.bounding_box.z * 10 }
    : { x: size.x, y: size.y, z: size.z };

  const labels: Array<{ position: [number, number, number]; text: string }> = [
    { position: [center.x, min.y, max.z], text: `X ${labelSize.x.toFixed(1)} mm` },
    { position: [min.x, center.y, max.z], text: `Y ${labelSize.y.toFixed(1)} mm` },
    { position: [max.x, min.y, center.z], text: `Z ${labelSize.z.toFixed(1)} mm` },
  ];

  return (
    <group position={offset} scale={scale}>
      <lineSegments geometry={edgesGeometry} position={center} renderOrder={5}>
        <lineBasicMaterial color="#0ea5e9" transparent opacity={0.85} depthTest={false} />
      </lineSegments>
      {labels.map((label) => (
        <Html
          key={label.text}
          position={label.position}
          center
          zIndexRange={[12, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div className="whitespace-nowrap rounded-md bg-sky-600 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white shadow-lg">
            {label.text}
          </div>
        </Html>
      ))}
    </group>
  );
};

/** Renders parsed shapes normalized to a fixed size, with edges + clipping. */
const ShapesGroup = ({
  shapes,
  displayMode,
  showEdges,
  clippingPlane,
  heatmap = false,
  explode = 0,
  onSurfaceClick,
}: {
  shapes: ParsedShape[];
  displayMode: DisplayMode;
  showEdges: boolean;
  clippingPlane: THREE.Plane | null;
  heatmap?: boolean;
  explode?: number;
  onSurfaceClick?: (point: THREE.Vector3) => void;
}) => {
  const { scale, offset, center } = useMemo(() => computeNormalization(shapes), [shapes]);

  // Exploded view: push each body away from the assembly center (model units).
  const explodeOffsets = useMemo(() => {
    return shapes.map((shape) => {
      shape.geometry.computeBoundingBox();
      const shapeCenter = shape.geometry.boundingBox
        ? shape.geometry.boundingBox.getCenter(new THREE.Vector3())
        : center.clone();
      const direction = shapeCenter.clone().sub(center);
      if (direction.lengthSq() < 1e-10) return new THREE.Vector3();
      return direction;
    });
  }, [shapes, center]);

  const edgeGeometries = useMemo(
    () => (showEdges ? shapes.map((shape) => new THREE.EdgesGeometry(shape.geometry, 25)) : []),
    [shapes, showEdges],
  );

  useEffect(
    () => () => {
      edgeGeometries.forEach((geometry) => geometry.dispose());
    },
    [edgeGeometries],
  );

  const clippingPlanes = clippingPlane ? [clippingPlane] : [];

  return (
    <group position={offset} scale={scale}>
      {shapes.map((shape, index) => (
        <group key={index} position={explodeOffsets[index].clone().multiplyScalar(explode * 0.8)}>
          <mesh
            geometry={shape.geometry}
            castShadow
            receiveShadow
            onClick={
              onSurfaceClick
                ? (event) => {
                    event.stopPropagation();
                    onSurfaceClick(event.point.clone());
                  }
                : undefined
            }
          >
            {/* vertexColors requires a shader recompile (material.needsUpdate)
                that R3F's prop-diffing won't trigger on an existing material
                instance — key it so toggling heatmap mounts a fresh one. */}
            <meshStandardMaterial
              key={heatmap ? 'heatmap' : 'shaded'}
              color={heatmap ? '#ffffff' : shape.color ?? '#8b93a7'}
              vertexColors={heatmap}
              metalness={heatmap ? 0.1 : 0.35}
              roughness={heatmap ? 0.7 : 0.45}
              wireframe={displayMode === 'wireframe'}
              clippingPlanes={clippingPlanes}
              clipShadows
              side={THREE.DoubleSide}
            />
          </mesh>
          {showEdges && displayMode === 'shaded' && edgeGeometries[index] && (
            <lineSegments geometry={edgeGeometries[index]}>
              <lineBasicMaterial color="#1e293b" clippingPlanes={clippingPlanes} />
            </lineSegments>
          )}
        </group>
      ))}
    </group>
  );
};

/** Two-point distance measurement overlay (world-space points). */
const MeasureOverlay = ({
  points,
  modelScale,
}: {
  points: THREE.Vector3[];
  modelScale: number;
}) => {
  if (points.length === 0) return null;
  const midpoint =
    points.length === 2
      ? points[0].clone().add(points[1]).multiplyScalar(0.5)
      : null;
  const distanceMm = points.length === 2 ? points[0].distanceTo(points[1]) / modelScale : null;

  return (
    <>
      {points.map((point, index) => (
        <mesh key={index} position={point} renderOrder={10}>
          <sphereGeometry args={[0.055, 16, 16]} />
          <meshBasicMaterial color="#e11d48" depthTest={false} />
        </mesh>
      ))}
      {points.length === 2 && (
        <Line
          points={[points[0], points[1]]}
          color="#e11d48"
          lineWidth={2}
          depthTest={false}
          renderOrder={10}
        />
      )}
      {midpoint && distanceMm !== null && (
        <Html position={midpoint} center zIndexRange={[15, 0]} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap rounded-md bg-rose-600 px-2 py-0.5 font-mono text-[11px] font-semibold text-white shadow-lg">
            {distanceMm.toFixed(2)} mm
          </div>
        </Html>
      )}
    </>
  );
};

/** Icon-only toolbar button with a fast custom tooltip — the native `title`
 * attribute has a ~1.5s hover delay and plain OS styling, easy to miss. */
const ToolbarButton = ({
  title,
  active = false,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <div className="relative group/tip">
    <button
      type="button"
      aria-label={title}
      onClick={onClick}
      className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
        active
          ? 'bg-primary-600 text-white'
          : 'bg-white/90 text-gray-600 hover:bg-white hover:text-gray-900'
      } shadow-sm backdrop-blur-sm`}
    >
      {children}
    </button>
    <span
      role="tooltip"
      className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-100 group-hover/tip:opacity-100"
    >
      {title}
    </span>
  </div>
);

const ModelViewer = ({ fileId, fileFormat, geometry, className }: ModelViewerProps) => {
  const [shapes, setShapes] = useState<ParsedShape[] | null>(null);
  const [source, setSource] = useState<ModelSource>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [displayMode, setDisplayMode] = useState<DisplayMode>('shaded');
  const [showEdges, setShowEdges] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [heatmapShapes, setHeatmapShapes] = useState<ParsedShape[] | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [sectionEnabled, setSectionEnabled] = useState(false);
  const [sectionAxis, setSectionAxis] = useState<SectionAxis>('x');
  const [sectionOffset, setSectionOffset] = useState(0);
  const [measureEnabled, setMeasureEnabled] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<THREE.Vector3[]>([]);
  const [explodeEnabled, setExplodeEnabled] = useState(false);
  const [explode, setExplode] = useState(0.6);
  const [showBoundingBox, setShowBoundingBox] = useState(false);
  const [showPartInfo, setShowPartInfo] = useState(false);
  const [viewRequest, setViewRequest] = useState<{
    position: [number, number, number];
    seq: number;
  } | null>(null);
  const viewSeq = useRef(0);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadedShapes: ParsedShape[] | null = null;

    const load = async () => {
      setLoading(true);
      setLoadError(false);
      setShapes(null);
      setSource(null);
      setHeatmapEnabled(false);
      setHeatmapShapes((prev) => {
        if (prev) disposeShapes(prev);
        return null;
      });
      setMeasureEnabled(false);
      setMeasurePoints([]);
      setExplodeEnabled(false);

      const format = fileFormat.toLowerCase();
      try {
        if (format === 'stl') {
          const blob = await fetchFilePreviewBlob(fileId);
          if (cancelled) return;
          loadedShapes = parseStlBuffer(await blob.arrayBuffer());
          if (cancelled) return;
          setShapes(loadedShapes);
          setSource('mesh');
        } else if (format === 'step') {
          // Preferred: parse the original STEP exactly in the browser (OCCT WASM).
          try {
            const blob = await fetchFileDownloadBlob(fileId);
            if (cancelled) return;
            loadedShapes = await parseStepBuffer(await blob.arrayBuffer());
            if (cancelled) return;
            setShapes(loadedShapes);
            setSource('exact-cad');
          } catch (stepError) {
            console.warn('Client-side STEP parsing failed, falling back to GLB preview:', stepError);
            const blob = await fetchFilePreviewBlob(fileId);
            if (cancelled) return;
            loadedShapes = await parseGlbBuffer(await blob.arrayBuffer());
            if (cancelled) return;
            setShapes(loadedShapes);
            setSource('mesh');
          }
        } else {
          setLoadError(true);
        }
      } catch (error) {
        console.error('Failed to load 3D preview:', error);
        if (!cancelled) {
          setLoadError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      if (loadedShapes) {
        disposeShapes(loadedShapes);
      }
    };
  }, [fileId, fileFormat]);

  const modelScale = useMemo(
    () => (shapes && shapes.length > 0 ? computeNormalization(shapes).scale : 1),
    [shapes],
  );

  const meshStats = useMemo(
    () => (showPartInfo && shapes && shapes.length > 0 ? computeMeshStats(shapes) : null),
    [showPartInfo, shapes],
  );

  const meshSize = useMemo(
    () => (shapes && shapes.length > 0 ? computeNormalization(shapes).size : null),
    [shapes],
  );

  const handleSurfaceClick = useCallback((point: THREE.Vector3) => {
    setMeasurePoints((prev) => (prev.length >= 2 ? [point] : [...prev, point]));
  }, []);

  const toggleMeasure = useCallback(() => {
    setMeasureEnabled((prev) => {
      if (prev) setMeasurePoints([]);
      return !prev;
    });
  }, []);

  const toggleExplode = useCallback(() => {
    setExplodeEnabled((prev) => !prev);
    // Exploded distances are not physical — drop any active measurement.
    setMeasurePoints([]);
  }, []);

  const clippingPlane = useMemo(() => {
    if (!sectionEnabled) return null;
    const normal = AXIS_NORMALS[sectionAxis].clone();
    // Model is normalized to ±MODEL_SIZE/2 around the origin.
    const constant = sectionOffset * (MODEL_SIZE / 2 + 0.2);
    return new THREE.Plane(normal, constant);
  }, [sectionEnabled, sectionAxis, sectionOffset]);

  const requestView = useCallback((preset: keyof typeof VIEW_PRESETS) => {
    viewSeq.current += 1;
    setViewRequest({ position: VIEW_PRESETS[preset], seq: viewSeq.current });
  }, []);

  const toggleHeatmap = useCallback(async () => {
    if (heatmapEnabled) {
      setHeatmapEnabled(false);
      return;
    }
    if (heatmapShapes) {
      setHeatmapEnabled(true);
      return;
    }
    if (!shapes || heatmapLoading) return;

    setHeatmapLoading(true);
    try {
      const computed = await computeThicknessHeatmap(shapes);
      setHeatmapShapes(computed);
      setHeatmapEnabled(true);
    } catch (error) {
      console.error('Wall-thickness heatmap failed:', error);
    } finally {
      setHeatmapLoading(false);
    }
  }, [heatmapEnabled, heatmapShapes, shapes, heatmapLoading]);

  const takeScreenshot = useCallback(() => {
    const gl = glRef.current;
    if (!gl) return;
    const link = document.createElement('a');
    link.href = gl.domElement.toDataURL('image/png');
    link.download = 'part-preview.png';
    link.click();
  }, []);

  const dims = geometry
    ? {
        x: (geometry.bounding_box.x * 10).toFixed(1),
        y: (geometry.bounding_box.y * 10).toFixed(1),
        z: (geometry.bounding_box.z * 10).toFixed(1),
      }
    : null;

  return (
    <div
      className={`relative w-full bg-slate-400 rounded-xl overflow-hidden border border-slate-400/60 shadow-inner ${
        measureEnabled ? 'cursor-crosshair' : ''
      } ${className ?? 'h-[400px] sm:h-[560px]'}`}
    >
      {/* Toolbar */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
        <ToolbarButton title="Fit to view (ISO)" onClick={() => requestView('iso')}>
          <Maximize2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title={displayMode === 'shaded' ? 'Wireframe view' : 'Shaded view'}
          active={displayMode === 'wireframe'}
          onClick={() => setDisplayMode((prev) => (prev === 'shaded' ? 'wireframe' : 'shaded'))}
        >
          {displayMode === 'shaded' ? <Grid3x3 className="w-4 h-4" /> : <BoxIcon className="w-4 h-4" />}
        </ToolbarButton>
        <ToolbarButton
          title="Toggle edge lines"
          active={showEdges}
          onClick={() => setShowEdges((prev) => !prev)}
        >
          <Hexagon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Section view"
          active={sectionEnabled}
          onClick={() => setSectionEnabled((prev) => !prev)}
        >
          <Scissors className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Wall-thickness heatmap (DFM)"
          active={heatmapEnabled}
          onClick={toggleHeatmap}
        >
          {heatmapLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Thermometer className="w-4 h-4" />}
        </ToolbarButton>
        <ToolbarButton
          title="Measure distance (click two points)"
          active={measureEnabled}
          onClick={toggleMeasure}
        >
          <Ruler className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Bounding box with dimensions"
          active={showBoundingBox}
          onClick={() => setShowBoundingBox((prev) => !prev)}
        >
          <Move3d className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Part info (volume, area, features)"
          active={showPartInfo}
          onClick={() => setShowPartInfo((prev) => !prev)}
        >
          <Info className="w-4 h-4" />
        </ToolbarButton>
        {shapes && shapes.length > 1 && (
          <ToolbarButton
            title="Exploded view (assemblies)"
            active={explodeEnabled}
            onClick={toggleExplode}
          >
            <Boxes className="w-4 h-4" />
          </ToolbarButton>
        )}
        <ToolbarButton
          title="Auto-rotate"
          active={autoRotate}
          onClick={() => setAutoRotate((prev) => !prev)}
        >
          <RotateCw className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="Screenshot (PNG)" onClick={takeScreenshot}>
          <Camera className="w-4 h-4" />
        </ToolbarButton>
      </div>

      {/* View presets */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex rounded-lg overflow-hidden shadow-sm">
        {(['front', 'top', 'right', 'iso'] as const).map((view) => (
          <button
            key={view}
            type="button"
            onClick={() => requestView(view)}
            className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide bg-white/90 text-gray-600 hover:bg-white hover:text-gray-900 backdrop-blur-sm border-r border-gray-200 last:border-r-0"
          >
            {view}
          </button>
        ))}
      </div>

      {/* Format + source badges */}
      <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-1.5">
        <span className="bg-primary-100 text-primary-700 text-xs font-medium px-2.5 py-1 rounded-full">
          {fileFormat.toUpperCase()}
        </span>
        {source && (
          <span
            className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
              source === 'exact-cad'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-gray-200 text-gray-600'
            }`}
          >
            {source === 'exact-cad' ? 'Exact CAD geometry' : 'Mesh preview'}
          </span>
        )}
      </div>

      {/* Part info panel */}
      {showPartInfo && shapes && (
        <div className="absolute top-20 right-3 z-10 w-60 bg-white/95 backdrop-blur-sm rounded-lg shadow px-3.5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Part info</p>
          <dl className="space-y-1.5 text-xs text-gray-700">
            {(geometry || meshSize) && (
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Dimensions</dt>
                <dd className="font-mono text-right">
                  {geometry
                    ? `${(geometry.bounding_box.x * 10).toFixed(1)} × ${(geometry.bounding_box.y * 10).toFixed(1)} × ${(geometry.bounding_box.z * 10).toFixed(1)} mm`
                    : `${meshSize!.x.toFixed(1)} × ${meshSize!.y.toFixed(1)} × ${meshSize!.z.toFixed(1)} mm`}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Volume</dt>
              <dd className="font-mono">
                {geometry
                  ? `${Number(geometry.volume).toFixed(2)} cm³`
                  : meshStats
                  ? `${(meshStats.volumeMm3 / 1000).toFixed(2)} cm³`
                  : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Surface area</dt>
              <dd className="font-mono">
                {geometry
                  ? `${Number(geometry.surface_area).toFixed(1)} cm²`
                  : meshStats
                  ? `${(meshStats.surfaceAreaMm2 / 100).toFixed(1)} cm²`
                  : '—'}
              </dd>
            </div>
            {geometry?.hole_count != null && (
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Holes detected</dt>
                <dd className="font-mono">{geometry.hole_count}</dd>
              </div>
            )}
            {Boolean(geometry?.estimated_thread_count) && (
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Threaded (est.)</dt>
                <dd className="font-mono">{geometry!.estimated_thread_count}</dd>
              </div>
            )}
            {geometry?.min_wall_thickness != null && (
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Min wall</dt>
                <dd className="font-mono">{Number(geometry.min_wall_thickness).toFixed(2)} mm</dd>
              </div>
            )}
            {(meshStats?.triangleCount ?? geometry?.triangle_count) != null && (
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Triangles</dt>
                <dd className="font-mono">
                  {(meshStats?.triangleCount ?? geometry?.triangle_count)?.toLocaleString()}
                </dd>
              </div>
            )}
          </dl>
          {!geometry && (
            <p className="mt-2 text-[10px] leading-snug text-gray-400">
              Measured from the 3D mesh; backend analysis refines holes and walls.
            </p>
          )}
        </div>
      )}

      {/* Measure hint */}
      {measureEnabled && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 rounded-full bg-rose-600/95 px-3 py-1 text-[11px] font-medium text-white shadow backdrop-blur-sm">
          {measurePoints.length < 2
            ? `Click ${measurePoints.length === 0 ? 'first' : 'second'} point on the model`
            : 'Click again to start a new measurement'}
        </div>
      )}

      {/* Explode slider */}
      {explodeEnabled && (
        <div className={`absolute ${sectionEnabled ? 'bottom-14' : 'bottom-3'} left-1/2 -translate-x-1/2 z-10 bg-white/95 backdrop-blur-sm rounded-lg shadow px-3 py-2 flex items-center gap-2.5`}>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Explode</span>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={explode}
            onChange={(e) => setExplode(Number(e.target.value))}
            className="w-36 accent-primary-600"
          />
        </div>
      )}

      {/* Section controls */}
      {sectionEnabled && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 bg-white/95 backdrop-blur-sm rounded-lg shadow px-3 py-2 flex items-center gap-2.5">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <button
              key={axis}
              type="button"
              onClick={() => setSectionAxis(axis)}
              className={`w-6 h-6 rounded text-xs font-bold uppercase ${
                sectionAxis === axis
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {axis}
            </button>
          ))}
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={sectionOffset}
            onChange={(e) => setSectionOffset(Number(e.target.value))}
            className="w-36 accent-primary-600"
          />
        </div>
      )}

      {/* Heatmap legend */}
      {heatmapEnabled && (
        <div className="absolute bottom-24 right-3 z-10 bg-white/95 backdrop-blur-sm rounded-lg shadow px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Wall thickness</p>
          <div className="flex items-center gap-2.5 text-[10px] text-gray-600">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> &lt;1.5</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-400" /> &lt;2.5</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-300" /> &lt;4</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-400" /> ok</span>
            <span className="text-gray-400">mm</span>
          </div>
        </div>
      )}

      {/* Dimensions readout */}
      {dims && !sectionEnabled && (
        <div className="absolute bottom-3 left-3 z-10 bg-white/90 backdrop-blur-sm rounded-lg px-2.5 py-1.5 text-[11px] text-gray-700 shadow-sm font-medium">
          {dims.x} × {dims.y} × {dims.z} mm
        </div>
      )}

      {/* Loading / error states */}
      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-gray-100/70 backdrop-blur-[1px]">
          <Loader2 className="w-7 h-7 text-primary-600 animate-spin" />
          <p className="text-xs text-gray-500">
            {fileFormat.toLowerCase() === 'step' ? 'Reading exact CAD geometry…' : 'Loading model…'}
          </p>
        </div>
      )}
      {!loading && loadError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <p className="text-sm text-gray-500 bg-white/90 rounded-lg px-4 py-2 shadow-sm">
            3D preview unavailable for this file
          </p>
        </div>
      )}

      {/* 3D Canvas */}
      <Canvas
        shadows
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true;
          glRef.current = gl;
        }}
        onDoubleClick={() => requestView('iso')}
      >
        <PerspectiveCamera makeDefault position={VIEW_PRESETS.iso} fov={45} />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={1.5}
          maxDistance={25}
          autoRotate={autoRotate}
          autoRotateSpeed={1.2}
        />
        <ViewController request={viewRequest} />

        <ambientLight intensity={0.35} />
        <directionalLight
          position={[10, 12, 6]}
          intensity={1}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <directionalLight position={[-8, 4, -6]} intensity={0.4} />

        {shapes && (
          <ShapesGroup
            shapes={heatmapEnabled && heatmapShapes ? heatmapShapes : shapes}
            displayMode={displayMode}
            showEdges={showEdges}
            clippingPlane={clippingPlane}
            heatmap={heatmapEnabled && Boolean(heatmapShapes)}
            explode={explodeEnabled ? explode : 0}
            onSurfaceClick={measureEnabled ? handleSurfaceClick : undefined}
          />
        )}

        <MeasureOverlay points={measurePoints} modelScale={modelScale} />

        {showBoundingBox && shapes && !explodeEnabled && <BoundingBoxOverlay shapes={shapes} geometry={geometry} />}

        <Grid
          position={[0, -MODEL_SIZE / 2 - 0.35, 0]}
          args={[24, 24]}
          cellSize={0.5}
          cellColor="#64748b"
          sectionSize={2}
          sectionColor="#475569"
          fadeDistance={28}
          fadeStrength={1}
        />

        <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
          <GizmoViewcube
            color="#f8fafc"
            strokeColor="#94a3b8"
            textColor="#334155"
            hoverColor="#c7d2fe"
          />
        </GizmoHelper>

        {/* Local light rig — no runtime HDRI download (CSP-safe, offline-safe). */}
        <Environment resolution={256} frames={1}>
          <Lightformer intensity={3} position={[0, 6, -2]} scale={[9, 3, 1]} rotation-x={Math.PI / 2} />
          <Lightformer intensity={1.6} position={[-6, 2, 4]} scale={[6, 3, 1]} rotation-y={Math.PI / 3} />
          <Lightformer intensity={1.1} position={[7, 3, 2]} scale={[5, 4, 1]} rotation-y={-Math.PI / 3} />
        </Environment>
      </Canvas>
    </div>
  );
};

export default ModelViewer;
