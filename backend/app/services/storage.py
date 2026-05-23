"""Storage service abstraction for file handling."""
import os
import hashlib
import aiofiles
from pathlib import Path
from typing import BinaryIO, Optional
from abc import ABC, abstractmethod

from app.core.config import settings


class StorageBackend(ABC):
    """Abstract storage backend."""
    
    @abstractmethod
    async def save(self, file_data: bytes, filename: str) -> str:
        """Save file and return the path."""
        pass
    
    @abstractmethod
    async def get(self, path: str) -> bytes:
        """Get file contents."""
        pass
    
    @abstractmethod
    async def delete(self, path: str) -> bool:
        """Delete file."""
        pass
    
    @abstractmethod
    async def exists(self, path: str) -> bool:
        """Check if file exists."""
        pass
    
    @abstractmethod
    def get_url(self, path: str) -> str:
        """Get file URL for access."""
        pass


class LocalStorageBackend(StorageBackend):
    """Local filesystem storage backend."""
    
    def __init__(self, base_dir: str):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _resolve_path(self, path: str | Path) -> Path:
        candidate = Path(path)
        if candidate.is_absolute():
            return candidate
        return self.base_dir / candidate
    
    async def save(self, file_data: bytes, filename: str) -> str:
        """Save file to local filesystem."""
        file_path = self._resolve_path(filename)
        
        # Ensure subdirectories exist
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(file_data)
        
        return str(file_path)
    
    async def get(self, path: str) -> bytes:
        """Read file from local filesystem."""
        resolved = self._resolve_path(path)
        async with aiofiles.open(resolved, 'rb') as f:
            return await f.read()
    
    async def delete(self, path: str) -> bool:
        """Delete file from local filesystem."""
        try:
            os.remove(self._resolve_path(path))
            return True
        except OSError:
            return False
    
    async def exists(self, path: str) -> bool:
        """Check if file exists."""
        return os.path.exists(self._resolve_path(path))
    
    def get_url(self, path: str) -> str:
        """Get local file path."""
        return str(self._resolve_path(path))


class S3StorageBackend(StorageBackend):
    """S3-compatible storage backend (placeholder for future use)."""
    
    def __init__(self, bucket: str, region: str, access_key: str, secret_key: str):
        self.bucket = bucket
        self.region = region
        # In production, initialize boto3 client here
        raise NotImplementedError("S3 backend not yet implemented")
    
    async def save(self, file_data: bytes, filename: str) -> str:
        raise NotImplementedError()
    
    async def get(self, path: str) -> bytes:
        raise NotImplementedError()
    
    async def delete(self, path: str) -> bool:
        raise NotImplementedError()
    
    async def exists(self, path: str) -> bool:
        raise NotImplementedError()
    
    def get_url(self, path: str) -> str:
        raise NotImplementedError()


def compute_file_hash(data: bytes) -> str:
    """Compute SHA-256 hash of file data."""
    return hashlib.sha256(data).hexdigest()


def get_storage_backend() -> StorageBackend:
    """Factory function to get appropriate storage backend."""
    if settings.STORAGE_TYPE == "s3" and settings.S3_BUCKET:
        return S3StorageBackend(
            bucket=settings.S3_BUCKET,
            region=settings.S3_REGION,
            access_key=settings.S3_ACCESS_KEY,
            secret_key=settings.S3_SECRET_KEY,
        )
    return LocalStorageBackend(settings.UPLOAD_DIR)


# Global storage instance
storage = get_storage_backend()
