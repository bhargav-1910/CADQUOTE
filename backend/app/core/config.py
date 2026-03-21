"""Application configuration using pydantic-settings."""
from functools import lru_cache
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )
    
    # Application
    APP_NAME: str = "CNC Quote Platform"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/cncquote"
    DATABASE_POOL_SIZE: int = 10
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_TTL_SECONDS: int = 3600  # 1 hour
    
    # Storage
    STORAGE_TYPE: str = "local"  # "local" or "s3"
    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE_MB: int = 100
    ALLOWED_EXTENSIONS: list[str] = [".step", ".stp", ".stl"]
    
    # S3 Configuration (for future use)
    S3_BUCKET: Optional[str] = None
    S3_REGION: Optional[str] = None
    S3_ACCESS_KEY: Optional[str] = None
    S3_SECRET_KEY: Optional[str] = None
    
    # Pricing defaults
    DEFAULT_MARGIN_FACTOR: float = 1.25
    DEFAULT_HOURLY_MACHINE_RATE: float = 85.0  # USD per hour
    DEFAULT_MACHINE_EFFICIENCY: float = 0.75
    DEFAULT_REMOVAL_FACTOR: float = 0.6
    
    # Quote settings
    QUOTE_VALIDITY_DAYS: int = 14

    # Email settings
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_USE_TLS: bool = True
    SMTP_FROM_EMAIL: str = "quotes@cncplatform.com"
    SMTP_FROM_NAME: str = "CNC Quote Platform"
    
    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173"]


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
