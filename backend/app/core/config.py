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
    AUTO_CREATE_TABLES: bool = False
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_TTL_SECONDS: int = 3600  # 1 hour
    
    # Storage
    STORAGE_TYPE: str = "local"  # "local" or "s3"
    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE_MB: int = 100
    ALLOWED_EXTENSIONS: list[str] = [".step", ".stp", ".stl"]
    
    # S3 Configuration (R2/S3 compatible)
    S3_BUCKET: Optional[str] = None
    S3_REGION: Optional[str] = None
    S3_ACCESS_KEY: Optional[str] = None
    S3_SECRET_KEY: Optional[str] = None
    S3_ENDPOINT_URL: Optional[str] = None
    S3_PUBLIC_BASE_URL: Optional[str] = None
    
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
    FRONTEND_BASE_URL: str = "http://localhost"

    # Billing and points
    # Master switch: when False, no action consumes points (dev/testing mode).
    POINTS_SYSTEM_ENABLED: bool = False
    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None
    BILLING_CURRENCY: str = "inr"
    POINTS_COST_UPLOAD_FILE: int = 2
    POINTS_COST_TRIGGER_PROCESSING: int = 3
    POINTS_COST_CREATE_QUOTE: int = 8
    POINTS_COST_SEND_QUOTE_EMAIL: int = 2
    POINTS_STARTING_BONUS: int = 200

    # Authentication
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    
    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    @staticmethod
    def _strip_wrapping_quotes(value: str) -> str:
        if value.startswith('"') and value.endswith('"'):
            return value[1:-1]
        if value.startswith("'") and value.endswith("'"):
            return value[1:-1]
        return value

    def model_post_init(self, __context: object) -> None:
        """Normalize database URL for async SQLAlchemy drivers."""
        self.DATABASE_URL = self._strip_wrapping_quotes(self.DATABASE_URL.strip())
        if self.REDIS_URL:
            self.REDIS_URL = self._strip_wrapping_quotes(self.REDIS_URL.strip())
        if self.S3_ENDPOINT_URL:
            self.S3_ENDPOINT_URL = self._strip_wrapping_quotes(self.S3_ENDPOINT_URL.strip())
        if self.S3_PUBLIC_BASE_URL:
            self.S3_PUBLIC_BASE_URL = self._strip_wrapping_quotes(self.S3_PUBLIC_BASE_URL.strip())

        if self.DATABASE_URL.startswith("sqlite"):
            return

        if "+asyncpg" in self.DATABASE_URL:
            return

        if self.DATABASE_URL.startswith("postgresql://"):
            self.DATABASE_URL = self.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
            return

        if self.DATABASE_URL.startswith("postgres://"):
            self.DATABASE_URL = self.DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
