"""Geometry analysis service for CAD files."""
import time
import asyncio
import logging
import os
from typing import Optional, Dict, Any
from pathlib import Path
import tempfile
from datetime import datetime
import numpy as np

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.models import CADFile, GeometryAnalysis, ProcessingStatus
from app.core.cache import cache
from app.core.config import settings
from app.services.storage import storage

logger = logging.getLogger(__name__)


class GeometryProcessor:
    """Processes CAD files to extract geometry metrics."""
    
    def __init__(self):
        self._trimesh = None
    
    def _get_trimesh(self):
        """Lazy load trimesh to avoid startup overhead."""
        if self._trimesh is None:
            import trimesh
            self._trimesh = trimesh
        return self._trimesh
    
    async def analyze_file(
        self,
        file_path: str,
        file_format: str
    ) -> Dict[str, Any]:
        """
        Analyze CAD file and extract geometry metrics.
        
        Runs in thread pool to avoid blocking.
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._analyze_sync,
            file_path,
            file_format
        )
    
    def _analyze_sync(
        self,
        file_path: str,
        file_format: str
    ) -> Dict[str, Any]:
        """Synchronous geometry analysis."""
        start_time = time.time()
        trimesh = self._get_trimesh()
        
        try:
            # Load mesh
            if file_format == 'step':
                mesh = self._load_step_file(file_path)
            else:
                mesh = trimesh.load(file_path)
            
            # Ensure we have a mesh
            if isinstance(mesh, trimesh.Scene):
                # Combine all geometries in scene
                mesh = mesh.dump(concatenate=True)
            
            if not isinstance(mesh, trimesh.Trimesh):
                raise ValueError(f"Could not load mesh from file")
            
            # Process mesh
            mesh.fix_normals()
            
            # Extract metrics (convert to cm for consistency)
            # Assuming input is in mm (common for CAD)
            scale_factor = 0.1  # mm to cm
            
            volume_cm3 = abs(mesh.volume) * (scale_factor ** 3)
            surface_area_cm2 = mesh.area * (scale_factor ** 2)
            
            # Bounding box
            bounds = mesh.bounds * scale_factor
            bbox_dimensions = bounds[1] - bounds[0]
            bbox_x, bbox_y, bbox_z = bbox_dimensions
            bounding_box_volume = float(np.prod(bbox_dimensions))
            
            # Scale-robust complexity score (dimensionless): A^(3/2) / V
            # This is less sensitive to absolute part size than A/V.
            complexity_score = (
                (surface_area_cm2 ** 1.5) / volume_cm3
                if volume_cm3 > 0 and surface_area_cm2 > 0
                else 0
            )
            
            # Removal ratio (how much material needs to be removed)
            removal_ratio = volume_cm3 / bounding_box_volume if bounding_box_volume > 0 else 0
            
            # Hole detection (simplified - count vertices with high curvature)
            hole_count = self._estimate_hole_count(mesh)
            
            # Wall thickness estimation (simplified)
            min_wall_thickness = self._estimate_min_wall_thickness(mesh, scale_factor)
            
            analysis_time = time.time() - start_time
            
            return {
                "volume": round(volume_cm3, 4),
                "surface_area": round(surface_area_cm2, 4),
                "bbox_x": round(float(bbox_x), 4),
                "bbox_y": round(float(bbox_y), 4),
                "bbox_z": round(float(bbox_z), 4),
                "bounding_box_volume": round(bounding_box_volume, 4),
                "min_wall_thickness": round(min_wall_thickness, 2) if min_wall_thickness else None,
                "hole_count": hole_count,
                "complexity_score": round(complexity_score, 4),
                "removal_ratio": round(removal_ratio, 4),
                "triangle_count": len(mesh.faces),
                "vertex_count": len(mesh.vertices),
                "analysis_time_seconds": round(analysis_time, 3),
                "analysis_library": "trimesh",
            }
            
        except Exception as e:
            logger.error(f"Geometry analysis failed: {e}")
            raise
    
    def _load_step_file(self, file_path: str):
        """Load STEP file using cascadio for OpenCASCADE support."""
        trimesh = self._get_trimesh()
        
        # Try using cascadio for STEP file loading
        try:
            import cascadio
            import os
            
            # Create a temp OBJ file path
            obj_path = file_path + ".obj"
            
            try:
                # Convert STEP to OBJ format using file paths (cascadio API)
                cascadio.step_to_obj(file_path, obj_path)
                
                # Load the OBJ file with trimesh
                mesh = trimesh.load(obj_path)
                
                return mesh
            finally:
                # Clean up temp files
                if os.path.exists(obj_path):
                    os.remove(obj_path)
                # Also remove potential MTL file
                mtl_path = obj_path.replace('.obj', '.mtl')
                if os.path.exists(mtl_path):
                    os.remove(mtl_path)
                    
        except ImportError:
            logger.warning("cascadio not available, trying direct trimesh load")
        except Exception as e:
            logger.warning(f"cascadio STEP load failed: {e}, trying trimesh")
        
        # Fallback to trimesh's native loader
        try:
            mesh = trimesh.load(file_path)
            return mesh
        except Exception as e:
            logger.warning(f"Direct STEP load failed: {e}")
            raise ValueError(
                "STEP file loading requires OpenCASCADE. "
                "Please install with: pip install cascadio"
            )
    
    def _estimate_hole_count(self, mesh) -> int:
        """
        Estimate number of holes using Euler characteristic.
        
        For a mesh: V - E + F = 2 - 2g - b
        where g = genus (handles), b = boundary loops (holes)
        """
        try:
            # Simple estimation based on mesh topology
            euler = mesh.euler_number
            # For a closed mesh, euler = 2 - 2g
            # Holes would show as additional boundary loops
            
            # Count boundary edges
            edges = mesh.edges_unique
            edges_per_face = mesh.edges_face
            
            # Edges that appear only once are boundary edges
            edge_counts = np.bincount(edges_per_face.flatten())
            boundary_edges = np.sum(edge_counts == 1)
            
            # Rough estimate: each hole has ~8-16 boundary edges on average
            estimated_holes = max(0, boundary_edges // 12)
            
            return min(estimated_holes, 50)  # Cap at reasonable number
        except Exception:
            return 0
    
    def _estimate_min_wall_thickness(
        self, 
        mesh, 
        scale_factor: float
    ) -> Optional[float]:
        """
        Estimate minimum wall thickness using ray casting.
        
        This is a simplified estimation - full analysis would require
        more sophisticated algorithms.
        """
        try:
            # Sample points on surface
            points, face_idx = mesh.sample(500, return_index=True)
            normals = mesh.face_normals[face_idx]
            
            # Cast rays inward from surface points
            thicknesses = []
            
            for point, normal in zip(points[:100], normals[:100]):
                # Cast ray inward
                inward_dir = -normal
                
                # Find intersection with opposite wall
                locations, index_ray, index_tri = mesh.ray.intersects_location(
                    ray_origins=[point + inward_dir * 0.01],
                    ray_directions=[inward_dir]
                )
                
                if len(locations) > 0:
                    # Distance to nearest opposite wall
                    distances = np.linalg.norm(locations - point, axis=1)
                    if len(distances) > 0:
                        thicknesses.append(np.min(distances))
            
            if thicknesses:
                # Convert to mm and return minimum
                min_thickness = np.percentile(thicknesses, 5) * scale_factor * 10
                return float(min_thickness) if min_thickness > 0.1 else None
            
            return None
        except Exception:
            return None


# Global processor instance
geometry_processor = GeometryProcessor()


async def process_cad_file(
    db: AsyncSession,
    cad_file: CADFile
) -> GeometryAnalysis:
    """
    Process CAD file and create geometry analysis.
    
    Uses caching to avoid reprocessing identical files.
    """
    # Check cache first
    cache_key = cache.geometry_key(cad_file.file_hash)
    cached_data = await cache.get(cache_key)
    
    if cached_data:
        logger.info(f"Using cached geometry for {cad_file.file_hash}")
        analysis_data = cached_data
    else:
        # Update status to processing
        cad_file.processing_status = ProcessingStatus.PROCESSING
        await db.commit()
        
        try:
            # Perform analysis. For remote storage, materialize a temp file first.
            if settings.STORAGE_TYPE == "s3":
                suffix = ".stl" if cad_file.file_format == "stl" else ".step"
                fd, temp_path = tempfile.mkstemp(suffix=suffix)
                os.close(fd)
                try:
                    content = await storage.get(cad_file.file_path)
                    with open(temp_path, "wb") as f:
                        f.write(content)
                    analysis_data = await geometry_processor.analyze_file(
                        temp_path,
                        cad_file.file_format,
                    )
                finally:
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
            else:
                analysis_data = await geometry_processor.analyze_file(
                    cad_file.file_path,
                    cad_file.file_format
                )
            
            # Cache the result
            await cache.set(cache_key, analysis_data)
            
        except Exception as e:
            cad_file.processing_status = ProcessingStatus.FAILED
            cad_file.processing_error = str(e)
            await db.commit()
            raise
    
    # Create geometry analysis record
    geometry = GeometryAnalysis(
        cad_file_id=cad_file.id,
        volume=analysis_data["volume"],
        surface_area=analysis_data["surface_area"],
        bbox_x=analysis_data["bbox_x"],
        bbox_y=analysis_data["bbox_y"],
        bbox_z=analysis_data["bbox_z"],
        bounding_box_volume=analysis_data["bounding_box_volume"],
        min_wall_thickness=analysis_data.get("min_wall_thickness"),
        hole_count=analysis_data.get("hole_count", 0),
        complexity_score=analysis_data["complexity_score"],
        removal_ratio=analysis_data["removal_ratio"],
        triangle_count=analysis_data.get("triangle_count"),
        vertex_count=analysis_data.get("vertex_count"),
        analysis_time_seconds=analysis_data.get("analysis_time_seconds"),
        analysis_library=analysis_data.get("analysis_library"),
    )
    
    db.add(geometry)
    
    # Update CAD file status
    cad_file.processing_status = ProcessingStatus.COMPLETED
    cad_file.processed_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(geometry)
    
    return geometry


async def get_geometry_analysis(
    db: AsyncSession,
    cad_file_id: str
) -> GeometryAnalysis | None:
    """Get geometry analysis for a CAD file."""
    query = select(GeometryAnalysis).where(
        GeometryAnalysis.cad_file_id == cad_file_id
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


# Import at end to avoid circular import
from datetime import datetime
