"""Redis cache management."""
import json
import logging
from typing import Any, Optional
import redis.asyncio as redis

from app.core.config import settings

logger = logging.getLogger(__name__)


class CacheManager:
    """Redis cache manager for geometry data caching."""
    
    def __init__(self):
        self._redis: Optional[redis.Redis] = None
        self._connected = False
    
    async def connect(self):
        """Connect to Redis."""
        try:
            self._redis = redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
            )
            # Test connection
            await self._redis.ping()
            self._connected = True
            logger.info("Redis cache connected")
        except Exception as e:
            logger.warning(f"Redis connection failed: {e}. Caching disabled.")
            self._redis = None
            self._connected = False
    
    async def disconnect(self):
        """Disconnect from Redis."""
        if self._redis:
            try:
                await self._redis.close()
            except Exception:
                pass
            self._redis = None
            self._connected = False
    
    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        if not self._redis or not self._connected:
            return None
        
        try:
            value = await self._redis.get(key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            logger.warning(f"Cache get error: {e}")
            return None
    
    async def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None
    ):
        """Set value in cache with optional TTL."""
        if not self._redis or not self._connected:
            return
        
        try:
            ttl = ttl or settings.CACHE_TTL_SECONDS
            await self._redis.setex(key, ttl, json.dumps(value))
        except Exception as e:
            logger.warning(f"Cache set error: {e}")
    
    async def delete(self, key: str):
        """Delete value from cache."""
        if not self._redis or not self._connected:
            return
        
        try:
            await self._redis.delete(key)
        except Exception as e:
            logger.warning(f"Cache delete error: {e}")
    
    async def exists(self, key: str) -> bool:
        """Check if key exists in cache."""
        if not self._redis or not self._connected:
            return False
        
        try:
            return await self._redis.exists(key) > 0
        except Exception as e:
            logger.warning(f"Cache exists error: {e}")
            return False
    
    def geometry_key(self, file_hash: str) -> str:
        """Generate cache key for geometry data."""
        return f"geometry:{file_hash}"
    
    def quote_key(self, quote_id: str) -> str:
        """Generate cache key for quote data."""
        return f"quote:{quote_id}"


# Global cache instance
cache = CacheManager()
