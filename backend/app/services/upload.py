"""Upload service for CAD file handling."""
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Tuple

from fastapi import UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.models.models import CADFile, ProcessingStatus
from app.services.storage import storage, compute_file_hash


# Allowed extensions
ALLOWED_EXTENSIONS = {'.step', '.stp', '.stl'}


def validate_file_extension(filename: str) -> str:
    """Validate and return file extension."""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not supported. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    return ext


def validate_file_size(size: int) -> None:
    """Validate file size."""
    max_size = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    if size > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {settings.MAX_FILE_SIZE_MB}MB"
        )


def normalize_file_format(ext: str) -> str:
    """Normalize file extension to format name."""
    ext_map = {
        '.step': 'step',
        '.stp': 'step',
        '.stl': 'stl',
    }
    return ext_map.get(ext, ext.lstrip('.'))


async def check_duplicate_file(
    db: AsyncSession, 
    file_hash: str,
    user_id: uuid.UUID,
) -> CADFile | None:
    """Check if file with same hash already exists."""
    query = select(CADFile).where(CADFile.file_hash == file_hash, CADFile.user_id == user_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def upload_cad_file(
    db: AsyncSession,
    file: UploadFile,
    user_id: uuid.UUID,
) -> Tuple[CADFile, bool]:
    """
    Upload and validate CAD file.
    
    Returns:
        Tuple of (CADFile, is_duplicate)
    """
    # Read file content
    content = await file.read()
    file_size = len(content)
    
    # Validate
    validate_file_size(file_size)
    extension = validate_file_extension(file.filename)
    file_format = normalize_file_format(extension)
    
    # Compute hash
    file_hash = compute_file_hash(content)
    
    # Check for duplicate
    existing_file = await check_duplicate_file(db, file_hash, user_id)
    if existing_file:
        return existing_file, True
    
    # Generate unique filename
    file_id = uuid.uuid4()
    stored_filename = f"{file_id}{extension}"
    
    # Organize by date
    date_prefix = datetime.utcnow().strftime("%Y/%m/%d")
    relative_path = f"{date_prefix}/{stored_filename}"
    
    # Save file
    file_path = await storage.save(content, relative_path)
    
    # Create database record
    cad_file = CADFile(
        id=file_id,
        user_id=user_id,
        original_filename=file.filename,
        stored_filename=stored_filename,
        file_path=file_path,
        file_hash=file_hash,
        file_size=file_size,
        file_format=file_format,
        processing_status=ProcessingStatus.PENDING,
    )
    
    db.add(cad_file)
    await db.flush()
    await db.refresh(cad_file)
    
    return cad_file, False


async def get_cad_file(db: AsyncSession, file_id: uuid.UUID, user_id: uuid.UUID) -> CADFile | None:
    """Get CAD file by ID."""
    query = select(CADFile).where(CADFile.id == file_id, CADFile.user_id == user_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_cad_file_content(file_path: str) -> bytes:
    """Get CAD file content for processing."""
    return await storage.get(file_path)
