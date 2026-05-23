import { Suspense, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Center, Grid, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { STLLoader, GLTFLoader } from 'three-stdlib';
import type { GeometryAnalysis } from '@/types';
import { fetchFilePreviewBlob } from '@/services/api';
import { ZoomIn, Move } from 'lucide-react';

interface ModelViewerProps {
  fileId: string;
  fileFormat: string;
  geometry?: GeometryAnalysis;
}

interface SceneProps {
  fileFormat: string;
  geometry?: GeometryAnalysis;
  previewUrl: string | null;
  previewBlob: Blob | null;
}

// STL Model Component
const STLModel = ({ blob }: { blob: Blob }) => {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    let mounted = true;

    const loadGeometry = async () => {
      try {
        const loader = new STLLoader();
        const buffer = await blob.arrayBuffer();
        if (!mounted) {
          return;
        }

        const geo = loader.parse(buffer);
        setLoadFailed(false);
        geo.computeVertexNormals();
        geo.center();

        // Scale to reasonable size
        geo.computeBoundingBox();
        const box = geo.boundingBox!;
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const safeMax = maxDim > 0 ? maxDim : 1;
        const scale = 4 / safeMax;
        geo.scale(scale, scale, scale);

        setGeometry(geo);
      } catch (error) {
        console.error('Error loading STL:', error);
        if (mounted) {
          setLoadFailed(true);
        }
      }
    };

    loadGeometry();

    return () => {
      mounted = false;
      if (geometry) {
        geometry.dispose();
      }
    };
  }, [blob]);

  // Slow rotation
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.1;
    }
  });

  if (!geometry) {
    if (loadFailed) {
      return (
        <Center>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[2.5, 1.6, 2]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.15} roughness={0.65} />
          </mesh>
        </Center>
      );
    }
    return null;
  }

  return (
    <Center>
      <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          color="#6366f1"
          metalness={0.3}
          roughness={0.5}
        />
      </mesh>
    </Center>
  );
};

// GLB Model Component (for STEP files converted to GLB)
const GLBModel = ({ url }: { url: string }) => {
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const loader = new GLTFLoader();
    let mounted = true;

    loader.load(
      url,
      (gltf) => {
        if (!mounted) {
          return;
        }
        setLoadFailed(false);
        const loadedScene = gltf.scene.clone();
        
        // Center the model
        const box = new THREE.Box3().setFromObject(loadedScene);
        const center = box.getCenter(new THREE.Vector3());
        loadedScene.position.sub(center);
        
        // Scale to reasonable size
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 4 / maxDim;
        loadedScene.scale.setScalar(scale);
        
        // Apply default material if meshes don't have one
        loadedScene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (!child.material || (child.material instanceof THREE.MeshBasicMaterial)) {
              child.material = new THREE.MeshStandardMaterial({
                color: '#6366f1',
                metalness: 0.3,
                roughness: 0.5,
              });
            }
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        
        setScene(loadedScene);
      },
      undefined,
      (error) => {
        console.error('Error loading GLB:', error);
        if (mounted) {
          setLoadFailed(true);
        }
      }
    );

    return () => {
      mounted = false;
      if (scene) {
        scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material?.dispose();
            }
          }
        });
      }
    };
  }, [url]);

  // Slow rotation
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.1;
    }
  });

  if (!scene) {
    if (loadFailed) {
      return (
        <Center>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[2.5, 1.6, 2]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.15} roughness={0.65} />
          </mesh>
        </Center>
      );
    }
    return null;
  }

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
};

// Placeholder box (when file can't be loaded)
const PlaceholderBox = ({ dimensions }: { dimensions?: { x: number; y: number; z: number } }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Default dimensions if not provided
  const size = dimensions || { x: 2, y: 1, z: 1.5 };
  
  // Normalize to reasonable scale
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = 3 / maxDim;

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.15;
    }
  });

  return (
    <Center>
      <mesh ref={meshRef} castShadow receiveShadow>
        <boxGeometry args={[size.x * scale, size.y * scale, size.z * scale]} />
        <meshStandardMaterial
          color="#6366f1"
          metalness={0.3}
          roughness={0.5}
          transparent
          opacity={0.9}
        />
      </mesh>
    </Center>
  );
};

// Scene component
const Scene = ({ fileFormat, geometry, previewUrl, previewBlob }: SceneProps) => {
  const isSTL = fileFormat.toLowerCase() === 'stl';
  const isSTEP = fileFormat.toLowerCase() === 'step';

  return (
    <>
      <PerspectiveCamera makeDefault position={[5, 5, 5]} fov={50} />
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={2}
        maxDistance={20}
        maxPolarAngle={Math.PI / 2 + 0.1}
      />
      
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[10, 10, 5]}
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-10, 5, -5]} intensity={0.5} />
      
      {/* Model */}
      <Suspense fallback={null}>
        {isSTL ? (
          previewBlob ? (
            <STLModel blob={previewBlob} />
          ) : (
            <PlaceholderBox
              dimensions={geometry && {
                x: geometry.bounding_box.x,
                y: geometry.bounding_box.y,
                z: geometry.bounding_box.z,
              }}
            />
          )
        ) : isSTEP ? (
          previewUrl ? (
            <GLBModel url={previewUrl} />
          ) : (
            <PlaceholderBox
              dimensions={geometry && {
                x: geometry.bounding_box.x,
                y: geometry.bounding_box.y,
                z: geometry.bounding_box.z,
              }}
            />
          )
        ) : (
          <PlaceholderBox
            dimensions={geometry && {
              x: geometry.bounding_box.x,
              y: geometry.bounding_box.y,
              z: geometry.bounding_box.z,
            }}
          />
        )}
      </Suspense>
      
      {/* Grid floor */}
      <Grid
        position={[0, -2, 0]}
        args={[20, 20]}
        cellSize={0.5}
        cellColor="#d1d5db"
        sectionSize={2}
        sectionColor="#9ca3af"
        fadeDistance={30}
        fadeStrength={1}
      />
      
      {/* Environment */}
      <Environment preset="studio" />
    </>
  );
};

const ModelViewer = ({ fileId, fileFormat, geometry }: ModelViewerProps) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);

  useEffect(() => {
    let cancelled = false;
    let activeUrl: string | null = null;

    const loadPreview = async () => {
      try {
        const blob = await fetchFilePreviewBlob(fileId);
        if (cancelled) {
          return;
        }

        setPreviewBlob(blob);
        if (fileFormat.toLowerCase() !== 'stl') {
          activeUrl = URL.createObjectURL(blob);
          setPreviewUrl(activeUrl);
        } else {
          setPreviewUrl(null);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load authenticated preview:', error);
          setPreviewUrl(null);
          setPreviewBlob(null);
        }
      }
    };

    loadPreview();

    return () => {
      cancelled = true;
      if (activeUrl) {
        URL.revokeObjectURL(activeUrl);
      }
    };
  }, [fileId, fileFormat]);

  return (
    <div className="relative bg-gray-100 rounded-lg overflow-hidden h-[280px] sm:h-[400px]">
      {/* Controls hint */}
      <div className="absolute top-3 left-3 z-10 flex gap-2 flex-wrap max-w-[70%]">
        <div className="bg-white/90 backdrop-blur-sm rounded-lg px-2 sm:px-3 py-1.5 flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-gray-600 shadow-sm">
          <Move className="w-3.5 h-3.5" />
          <span>Drag to rotate</span>
        </div>
        <div className="bg-white/90 backdrop-blur-sm rounded-lg px-2 sm:px-3 py-1.5 flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-gray-600 shadow-sm">
          <ZoomIn className="w-3.5 h-3.5" />
          <span>Scroll to zoom</span>
        </div>
      </div>

      {/* File format badge */}
      <div className="absolute top-3 right-3 z-10">
        <span className="bg-primary-100 text-primary-700 text-xs font-medium px-2.5 py-1 rounded-full">
          {fileFormat.toUpperCase()}
        </span>
      </div>

      {/* 3D Canvas */}
      <Canvas shadows>
        <Suspense fallback={null}>
          <Scene
            fileFormat={fileFormat}
            geometry={geometry}
            previewUrl={previewUrl}
            previewBlob={previewBlob}
          />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default ModelViewer;
