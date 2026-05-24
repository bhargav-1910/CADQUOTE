"""Storage service abstraction for file handling."""
import os
import hashlib
import asyncio
import aiofiles
import boto3
from botocore.exceptions import ClientError
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
        if candidate.parts and candidate.parts[0] == self.base_dir.name:
            return self.base_dir / Path(*candidate.parts[1:])
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
    """S3-compatible storage backend (R2/S3)."""

    def __init__(
        self,
        bucket: str,
        region: str,
        access_key: str,
        secret_key: str,
        endpoint_url: str | None = None,
        public_base_url: str | None = None,
    ):
        self.bucket = bucket
        self.region = region
        self.endpoint_url = endpoint_url
        self.public_base_url = public_base_url
        self.client = boto3.client(
            "s3",
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            endpoint_url=endpoint_url,
        )

    async def save(self, file_data: bytes, filename: str) -> str:
        await asyncio.to_thread(
            self.client.put_object,
            Bucket=self.bucket,
            Key=filename,
            Body=file_data,
        )
        return filename

    async def get(self, path: str) -> bytes:
        def _read() -> bytes:
            response = self.client.get_object(Bucket=self.bucket, Key=path)
            return response["Body"].read()

        return await asyncio.to_thread(_read)

    async def delete(self, path: str) -> bool:
        try:
            await asyncio.to_thread(self.client.delete_object, Bucket=self.bucket, Key=path)
            return True
        except ClientError:
            return False

    async def exists(self, path: str) -> bool:
        try:
            await asyncio.to_thread(self.client.head_object, Bucket=self.bucket, Key=path)
            return True
        except ClientError as exc:
            error_code = str(exc.response.get("Error", {}).get("Code", ""))
            if error_code in {"404", "NoSuchKey", "NotFound"}:
                return False
            return False

    def get_url(self, path: str) -> str:
        if self.public_base_url:
            return f"{self.public_base_url.rstrip('/')}/{path}"
        if self.endpoint_url:
            return f"{self.endpoint_url.rstrip('/')}/{self.bucket}/{path}"
        return f"https://{self.bucket}.s3.{self.region}.amazonaws.com/{path}"


def compute_file_hash(data: bytes) -> str:
    """Compute SHA-256 hash of file data."""
    return hashlib.sha256(data).hexdigest()


def get_storage_backend() -> StorageBackend:
    """Factory function to get appropriate storage backend."""
    if settings.STORAGE_TYPE == "s3" and settings.S3_BUCKET:
        return S3StorageBackend(
            bucket=settings.S3_BUCKET,
            region=settings.S3_REGION or "auto",
            access_key=settings.S3_ACCESS_KEY or "",
            secret_key=settings.S3_SECRET_KEY or "",
            endpoint_url=settings.S3_ENDPOINT_URL,
            public_base_url=settings.S3_PUBLIC_BASE_URL,
        )
    return LocalStorageBackend(settings.UPLOAD_DIR)


# Global storage instance
storage = get_storage_backend()
