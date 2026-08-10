"""Upload service for CAD file handling."""
import os
import re
import unicodedata
import uuid
from datetime import datetime
from pathlib import Path
from typing import Tuple
from urllib.parse import quote

from fastapi import UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.models.models import CADFile, ProcessingStatus
from app.services.storage import storage, compute_file_hash


# Allowed extensions
ALLOWED_EXTENSIONS = {'.step', '.stp', '.stl'}

# Anything outside this set is stripped from a stored filename. Covers path
# separators (traversal), NUL and control bytes (null-byte injection, header
# splitting) and the quoting characters that break Content-Disposition.
_UNSAFE_FILENAME_CHARS = re.compile(r'[^A-Za-z0-9._ -]')
MAX_FILENAME_LENGTH = 120


def sanitize_filename(filename: str | None, *, fallback: str = "upload") -> str:
    """Reduce a client-supplied filename to a safe, displayable basename.

    Applied once at upload time so every later consumer — storage, headers,
    PDF text, the UI — works from a value that is already safe.
    """
    if not filename:
        return fallback

    # Take the basename under both separator conventions: a Windows client can
    # send "..\\..\\evil.stl" which posixpath alone would keep intact.
    base = os.path.basename(filename.replace("\\", "/")).strip()
    # Normalize so lookalike Unicode cannot smuggle a separator through.
    base = unicodedata.normalize("NFKC", base)
    base = base.replace("\x00", "")
    cleaned = _UNSAFE_FILENAME_CHARS.sub("_", base).strip(" .")
    if not cleaned or cleaned in {".", ".."}:
        return fallback

    stem, dot, suffix = cleaned.rpartition(".")
    if dot and len(cleaned) > MAX_FILENAME_LENGTH:
        keep = max(1, MAX_FILENAME_LENGTH - len(suffix) - 1)
        cleaned = f"{stem[:keep]}.{suffix}"
    return cleaned[:MAX_FILENAME_LENGTH]


def content_disposition(disposition: str, filename: str) -> str:
    """Build an RFC 6266 Content-Disposition value.

    The plain ``filename`` is sanitized to ASCII and the exact name is carried
    in ``filename*``; interpolating a raw name here is header injection.
    """
    safe = sanitize_filename(filename)
    ascii_name = safe.encode("ascii", "replace").decode("ascii").replace('"', "_")
    return f"{disposition}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(safe)}"


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


def validate_file_content(content: bytes, file_format: str) -> None:
    """Reject files whose bytes don't match the claimed CAD format.

    Extension checks alone let any renamed file through to the geometry
    parsers; these signature checks cut that off at upload time.
    """
    if file_format == 'step':
        # STEP (ISO 10303-21) files must open with the part-21 header keyword.
        head = content[:256].lstrip()
        if not head.startswith(b'ISO-10303-21'):
            raise HTTPException(
                status_code=400,
                detail="File content is not a valid STEP file (missing ISO-10303-21 header)",
            )
    elif file_format == 'stl':
        if len(content) < 15:
            raise HTTPException(status_code=400, detail="File is too small to be a valid STL")
        # ASCII STL starts with "solid"; binary STL declares its triangle count
        # at byte 80 and the payload length must match.
        if content[:16].lstrip().lower().startswith(b'solid'):
            return
        if len(content) < 84:
            raise HTTPException(status_code=400, detail="File content is not a valid STL file")
        import struct
        (triangle_count,) = struct.unpack('<I', content[80:84])
        if triangle_count == 0 or len(content) < 84 + triangle_count * 50:
            raise HTTPException(
                status_code=400,
                detail="File content is not a valid STL file (triangle count mismatch)",
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
    # Check the declared extension before touching the payload, so a rejected
    # type costs nothing.
    safe_filename = sanitize_filename(file.filename, fallback="part.stl")
    extension = validate_file_extension(safe_filename)
    file_format = normalize_file_format(extension)

    # Read with a hard ceiling instead of slurping the whole stream: an
    # oversized upload must be refused before it is resident in memory.
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    content = await file.read(max_bytes + 1)
    file_size = len(content)

    validate_file_size(file_size)
    if file_size == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    validate_file_content(content, file_format)

    # Every CAD file reaches storage through this function, so scanning here
    # covers all upload paths. No-op unless CLAMAV_ENABLED.
    from app.services.antivirus import assert_clean

    await assert_clean(content, filename=safe_filename)

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
        original_filename=safe_filename,
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
