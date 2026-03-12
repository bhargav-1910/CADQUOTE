import { Suspense, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Center, Grid, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { STLLoader, GLTFLoader } from 'three-stdlib';
import type { GeometryAnalysis } from '@/types';
import { getFilePreviewUrl } from '@/services/api';
import { ZoomIn, Move } from 'lucide-react';

interface ModelViewerProps {
  fileId: string;
  fileFormat: string;
  geometry?: GeometryAnalysis;
}

// STL Model Component
const STLModel = ({ url }: { url: string }) => {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    const loader = new STLLoader();
    loader.load(
      url,
      (geo) => {
        geo.computeVertexNormals();
        geo.center();
        
        // Scale to reasonable size
        geo.computeBoundingBox();
        const box = geo.boundingBox!;
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 4 / maxDim;
        geo.scale(scale, scale, scale);
        
        setGeometry(geo);
      },
      undefined,
      (error) => {
        console.error('Error loading STL:', error);
      }
    );

    return () => {
      if (geometry) {
        geometry.dispose();
      }
    };
  }, [url]);

  // Slow rotation
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.1;
    }
  });

  if (!geometry) {
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
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
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
      }
    );

    return () => {
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
const Scene = ({ fileId, fileFormat, geometry }: ModelViewerProps) => {
  const isSTL = fileFormat.toLowerCase() === 'stl';
  const isSTEP = fileFormat.toLowerCase() === 'step';
  const fileUrl = getFilePreviewUrl(fileId);

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
          <STLModel url={fileUrl} />
        ) : isSTEP ? (
          <GLBModel url={fileUrl} />
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
  return (
    <div className="relative bg-gray-100 rounded-lg overflow-hidden" style={{ height: '400px' }}>
      {/* Controls hint */}
      <div className="absolute top-3 left-3 z-10 flex gap-2">
        <div className="bg-white/90 backdrop-blur-sm rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs text-gray-600 shadow-sm">
          <Move className="w-3.5 h-3.5" />
          <span>Drag to rotate</span>
        </div>
        <div className="bg-white/90 backdrop-blur-sm rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs text-gray-600 shadow-sm">
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
          <Scene fileId={fileId} fileFormat={fileFormat} geometry={geometry} />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default ModelViewer;
