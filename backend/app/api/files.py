"""CAD file upload and management endpoints."""
import uuid
import logging
from typing import List

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db, get_db_session
from app.api.deps import get_current_user
from app.models.models import CADFile, GeometryAnalysis, ProcessingStatus, User
from app.schemas.schemas import (
    CADFileUploadResponse, CADFileResponse, 
    GeometryAnalysisResponse, BoundingBox
)
from app.services.upload import upload_cad_file, get_cad_file, get_cad_file_content
from app.services.geometry import process_cad_file, get_geometry_analysis
from app.services.dfm import analyze_dfm_from_geometry
from app.services.billing import consume_points, InsufficientPointsError
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/files",
    tags=["CAD Files"],
    dependencies=[Depends(get_current_user)],
)


@router.post("/upload", response_model=CADFileUploadResponse)
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a CAD file for analysis.
    
    Supported formats: STEP (.step, .stp), STL (.stl)
    
    The file will be validated, stored, and queued for geometry processing.
    """
    cad_file, is_duplicate = await upload_cad_file(db, file, current_user.id)
    
    if is_duplicate:
        return CADFileUploadResponse(
            id=cad_file.id,
            original_filename=cad_file.original_filename,
            file_format=cad_file.file_format,
            file_size=cad_file.file_size,
            file_hash=cad_file.file_hash,
            processing_status=cad_file.processing_status.value,
            message="File already exists. Using cached version.",
        )

    try:
        await consume_points(
            db,
            user_id=current_user.id,
            points=settings.POINTS_COST_UPLOAD_FILE,
            action="file_upload",
            description=f"Uploaded CAD file {cad_file.original_filename}",
            reference_type="cad_file",
            reference_id=str(cad_file.id),
        )
    except InsufficientPointsError:
        raise HTTPException(status_code=402, detail="Insufficient points. Please top up to upload new files.")
    
    # Commit the file upload before starting background task
    await db.commit()
    
    # Store file ID for background task (don't use SQLAlchemy object after commit)
    file_id = cad_file.id
    
    # Queue geometry processing in background
    async def process_geometry():
        try:
            async with get_db_session() as session:
                cad = await get_cad_file(session, file_id, current_user.id)
                if cad:
                    await process_cad_file(session, cad)
                    logger.info(f"Geometry processing completed for file {file_id}")
                else:
                    logger.error(f"CAD file {file_id} not found for processing")
        except Exception as e:
            logger.error(f"Geometry processing error for file {file_id}: {e}")
            # Update file status to failed
            try:
                async with get_db_session() as session:
                    cad = await get_cad_file(session, file_id, current_user.id)
                    if cad:
                        cad.processing_status = ProcessingStatus.FAILED
                        cad.processing_error = str(e)
                        await session.commit()
            except Exception as inner_e:
                logger.error(f"Failed to update error status: {inner_e}")
    
    background_tasks.add_task(process_geometry)
    
    return CADFileUploadResponse(
        id=cad_file.id,
        original_filename=cad_file.original_filename,
        file_format=cad_file.file_format,
        file_size=cad_file.file_size,
        file_hash=cad_file.file_hash,
        processing_status=cad_file.processing_status.value,
        message="File uploaded successfully. Processing started.",
    )


@router.get("/{file_id}", response_model=CADFileResponse)
async def get_file(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get CAD file details by ID."""
    cad_file = await get_cad_file(db, file_id, current_user.id)
    if not cad_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    return CADFileResponse(
        id=cad_file.id,
        original_filename=cad_file.original_filename,
        file_format=cad_file.file_format,
        file_size=cad_file.file_size,
        file_hash=cad_file.file_hash,
        processing_status=cad_file.processing_status.value,
        processing_error=cad_file.processing_error,
        created_at=cad_file.created_at,
        processed_at=cad_file.processed_at,
    )


@router.get("/{file_id}/geometry", response_model=GeometryAnalysisResponse)
async def get_file_geometry(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get geometry analysis for a CAD file."""
    # Check file exists
    cad_file = await get_cad_file(db, file_id, current_user.id)
    if not cad_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Check processing status
    if cad_file.processing_status == ProcessingStatus.PENDING:
        raise HTTPException(
            status_code=202, 
            detail="File is queued for processing"
        )
    elif cad_file.processing_status == ProcessingStatus.PROCESSING:
        raise HTTPException(
            status_code=202, 
            detail="File is being processed"
        )
    elif cad_file.processing_status == ProcessingStatus.FAILED:
        raise HTTPException(
            status_code=422,
            detail=f"Processing failed: {cad_file.processing_error}"
        )
    
    # Get geometry
    geometry = await get_geometry_analysis(db, file_id)
    if not geometry:
        raise HTTPException(status_code=404, detail="Geometry analysis not found")
    
    return GeometryAnalysisResponse(
        id=geometry.id,
        cad_file_id=geometry.cad_file_id,
        volume=geometry.volume,
        surface_area=geometry.surface_area,
        bounding_box=BoundingBox(
            x=geometry.bbox_x,
            y=geometry.bbox_y,
            z=geometry.bbox_z,
            volume=geometry.bounding_box_volume,
        ),
        min_wall_thickness=geometry.min_wall_thickness,
        hole_count=geometry.hole_count,
        hole_diameters_mm=getattr(geometry, "hole_diameters_mm", None),
        machining_direction_count=getattr(geometry, "machining_direction_count", None),
        brep_hole_data=getattr(geometry, "brep_hole_data", None),
        complexity_score=geometry.complexity_score,
        removal_ratio=geometry.removal_ratio,
        triangle_count=geometry.triangle_count,
        vertex_count=geometry.vertex_count,
        analysis_time_seconds=geometry.analysis_time_seconds,
        analysis_library=getattr(geometry, "analysis_library", None),
        dfm_analysis=analyze_dfm_from_geometry(geometry),
        created_at=geometry.created_at,
    )


@router.post("/{file_id}/process")
async def trigger_processing(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually trigger geometry processing for a file."""
    cad_file = await get_cad_file(db, file_id, current_user.id)
    if not cad_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    if cad_file.processing_status == ProcessingStatus.PROCESSING:
        raise HTTPException(
            status_code=400, 
            detail="File is already being processed"
        )
    
    try:
        try:
            await consume_points(
                db,
                user_id=current_user.id,
                points=settings.POINTS_COST_TRIGGER_PROCESSING,
                action="manual_geometry_processing",
                description=f"Manual processing for {cad_file.original_filename}",
                reference_type="cad_file",
                reference_id=str(cad_file.id),
            )
        except InsufficientPointsError:
            raise HTTPException(status_code=402, detail="Insufficient points. Please top up to process files.")

        geometry = await process_cad_file(db, cad_file)
        return {
            "status": "completed",
            "geometry_id": str(geometry.id),
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Processing failed: {str(e)}"
        )


@router.get("/{file_id}/download")
async def download_file(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download the original CAD file."""
    cad_file = await get_cad_file(db, file_id, current_user.id)
    if not cad_file:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        content = await get_cad_file_content(cad_file.file_path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")

    return Response(
        content=content,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{cad_file.original_filename}"'
        },
    )


@router.get("/{file_id}/preview")
async def preview_file(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a web-viewable version of the CAD file.
    
    - STL files are returned directly.
    - STEP files are converted to GLB format for 3D preview.
    """
    import os
    import tempfile
    
    cad_file = await get_cad_file(db, file_id, current_user.id)
    if not cad_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    # STL files can be served directly
    if cad_file.file_format == 'stl':
        try:
            content = await get_cad_file_content(cad_file.file_path)
        except Exception:
            raise HTTPException(status_code=404, detail="Preview file not found")

        return Response(
            content=content,
            media_type="model/stl",
            headers={
                "Content-Disposition": f'inline; filename="{cad_file.original_filename}"'
            },
        )
    
    # STEP files need to be converted to GLB
    if cad_file.file_format == 'step':
        try:
            import cascadio
            import trimesh

            try:
                step_content = await get_cad_file_content(cad_file.file_path)
            except Exception:
                raise HTTPException(status_code=404, detail="Preview file not found")

            # Create temp STEP + GLB files
            step_fd, step_path = tempfile.mkstemp(suffix='.step')
            glb_fd, glb_path = tempfile.mkstemp(suffix='.glb')
            os.close(step_fd)
            os.close(glb_fd)

            try:
                with open(step_path, 'wb') as f:
                    f.write(step_content)

                # Convert STEP to GLB
                cascadio.step_to_glb(step_path, glb_path)

                glb_content = b""
                if os.path.exists(glb_path):
                    with open(glb_path, 'rb') as f:
                        glb_content = f.read()

                if not glb_content:
                    mesh = trimesh.load(step_path)
                    if isinstance(mesh, trimesh.Scene):
                        mesh = mesh.dump(concatenate=True)
                    glb_content = mesh.export(file_type='glb')

                if not glb_content:
                    raise HTTPException(status_code=500, detail="STEP preview produced empty output")

                return Response(
                    content=glb_content,
                    media_type="model/gltf-binary",
                    headers={
                        "Content-Disposition": f'inline; filename="{cad_file.original_filename}.glb"'
                    }
                )
            finally:
                if os.path.exists(step_path):
                    os.remove(step_path)
                if os.path.exists(glb_path):
                    os.remove(glb_path)

        except ImportError:
            raise HTTPException(
                status_code=501,
                detail="STEP preview requires cascadio library"
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to convert STEP file for preview: {str(e)}"
            )
    
    raise HTTPException(
        status_code=400,
        detail=f"Preview not supported for format: {cad_file.file_format}"
    )
