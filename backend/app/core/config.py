"""Application configuration using pydantic-settings."""
from functools import lru_cache
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

# A bare ".env" resolves against the *working directory*, so running from
# backend/ silently missed the repository-root .env and every value only
# defined there (SMTP credentials, legal identity) fell back to its default.
# Check the working directory first, then the repo root, so both layouts work.
_BACKEND_DIR = Path(__file__).resolve().parents[2]
_ENV_FILES = (
    _BACKEND_DIR.parent / ".env",   # repository root (lowest priority)
    _BACKEND_DIR / ".env",          # backend/.env
    Path(".env"),                   # current working directory (wins)
)

# Placeholder secrets that must never reach production.
INSECURE_JWT_SECRETS = {
    "change-me-in-production",
    "change-this-in-production-use-a-long-random-string",
}


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=_ENV_FILES,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )
    
    # Application
    APP_NAME: str = "CNC Quote Platform"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"  # "development" | "production"
    
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
    
    # Malware scanning of uploads. Off by default; point at a clamd instance
    # to enable. Fail-closed refuses uploads while the scanner is down.
    CLAMAV_ENABLED: bool = False
    CLAMAV_HOST: str = "clamav"
    CLAMAV_PORT: int = 3310
    CLAMAV_TIMEOUT_SECONDS: int = 30
    CLAMAV_FAIL_CLOSED: bool = True

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

    # CAD analysis worker processes (CPU/RAM heavy; each warmed worker
    # holds trimesh+OpenCASCADE in memory, ~200-300MB).
    GEOMETRY_WORKERS: int = 2

    FRONTEND_BASE_URL: str = "http://localhost"

    # Subscription gate: free-plan users may only upload/quote the built-in
    # sample part, identified by the sha256 of its deterministic STL bytes.
    SAMPLE_PART_SHA256: str = "d654f3539c0d8a03aa18db6e0ab2885a1f29178f0154dff5d6e191ce92c93f03"

    # Billing and points
    # Master switch: when False, no action consumes points (dev/testing mode).
    POINTS_SYSTEM_ENABLED: bool = False
    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None
    BILLING_CURRENCY: str = "inr"
    POINTS_COST_UPLOAD_FILE: int = 2
    POINTS_COST_TRIGGER_PROCESSING: int = 3
    POINTS_COST_CREATE_QUOTE: int = 8
    POINTS_STARTING_BONUS: int = 200

    # Authentication
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Session limits. Idle timeout is enforced by refresh-token rotation (a
    # session dies if unused for this long); absolute timeout caps how long a
    # session may live regardless of activity, forcing re-authentication.
    SESSION_IDLE_TIMEOUT_MINUTES: int = 60 * 24 * 7  # 7 days
    SESSION_ABSOLUTE_TIMEOUT_HOURS: int = 24 * 30  # 30 days

    # Password policy
    PASSWORD_MIN_LENGTH: int = 12
    PASSWORD_HISTORY_DEPTH: int = 5  # how many old hashes block reuse
    # Argon2id parameters (OWASP minimum is m=47104, t=1, p=1). Raise
    # ARGON2_MEMORY_KIB on hosts with headroom; it is the strongest lever.
    ARGON2_TIME_COST: int = 3
    ARGON2_MEMORY_KIB: int = 65536  # 64 MiB
    ARGON2_PARALLELISM: int = 4
    BCRYPT_ROUNDS: int = 12  # legacy hashes only; upgraded on next login

    # Brute-force / throttling. Counts are per-identifier sliding windows.
    LOGIN_MAX_ATTEMPTS: int = 5  # failures before temporary account lock
    LOGIN_LOCKOUT_MINUTES: int = 15
    LOGIN_CAPTCHA_AFTER_FAILURES: int = 3  # client shows a challenge from here
    RATE_LIMIT_ENABLED: bool = True

    # Password reset
    PASSWORD_RESET_TOKEN_TTL_MINUTES: int = 15
    PASSWORD_RESET_MAX_PER_HOUR: int = 5

    # Email verification. Signup still logs the user straight in; verification
    # gates privilege (the admin role) rather than everyday use.
    EMAIL_VERIFICATION_TTL_HOURS: int = 48
    # Require a verified address before the admin role takes effect.
    REQUIRE_VERIFIED_EMAIL_FOR_ADMIN: bool = True

    # Comma-separated addresses RESERVED from public registration, so nobody
    # can claim the operator's own address on a fresh deployment. This does not
    # grant anything: the admin role is set out of band with
    #   python -m app.manage grant-admin <email>
    # Plain str (not list[str]) so a bare "a@b.com,c@d.com" env value parses;
    # pydantic-settings would demand JSON for a list-typed field.
    ADMIN_EMAILS: str = ""

    # Outbound email (password reset). Without SMTP_HOST configured the
    # message is logged instead of sent, so dev keeps working.
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USE_TLS: bool = True
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM_EMAIL: str = "no-reply@forgequote.app"
    SMTP_FROM_NAME: str = "ForgeQuote"

    # Legal / compliance identity. These populate the policy pages, the
    # security.txt document and outbound email footers.
    LEGAL_COMPANY_NAME: str = "ForgeQuote"
    LEGAL_CONTACT_EMAIL: str = "support@forgequote.app"
    LEGAL_PRIVACY_EMAIL: str = "privacy@forgequote.app"
    LEGAL_SECURITY_EMAIL: str = "security@forgequote.app"
    LEGAL_COMPANY_ADDRESS: str = "India"
    LEGAL_JURISDICTION: str = "India"
    LEGAL_POLICY_VERSION: str = "2026-07-30"
    LEGAL_DATA_RETENTION_DAYS: int = 365 * 2

    # Base64 32-byte key for column encryption (GSTIN, customer contacts).
    # Unset = plaintext, matching the previous behaviour. Generate with:
    #   python -c "import base64,os; print(base64.b64encode(os.urandom(32)).decode())"
    # Losing this key makes existing encrypted values unreadable — back it up
    # separately from the database.
    FIELD_ENCRYPTION_KEY: Optional[str] = None

    # Transport / hosting
    FORCE_HTTPS: bool = False  # redirect http -> https at the app layer
    HSTS_MAX_AGE_SECONDS: int = 63072000  # 2 years
    # Comma-separated Host header allowlist ("*" disables the check). Kept as
    # str for the same reason as ADMIN_EMAILS.
    ALLOWED_HOSTS: str = "*"
    MAX_REQUEST_BODY_MB: int = 110  # hard ceiling above MAX_FILE_SIZE_MB

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.strip().lower() == "production"

    @property
    def reserved_admin_emails(self) -> set[str]:
        """Normalized set of addresses blocked from public registration."""
        return {item.strip().lower() for item in self.ADMIN_EMAILS.split(",") if item.strip()}

    @property
    def allowed_host_list(self) -> list[str]:
        hosts = [item.strip() for item in self.ALLOWED_HOSTS.split(",") if item.strip()]
        return hosts or ["*"]

    @staticmethod
    def _strip_wrapping_quotes(value: str) -> str:
        if value.startswith('"') and value.endswith('"'):
            return value[1:-1]
        if value.startswith("'") and value.endswith("'"):
            return value[1:-1]
        return value

    def model_post_init(self, __context: object) -> None:
        """Normalize database URL for async SQLAlchemy drivers."""
        if self.is_production:
            if self.JWT_SECRET_KEY in INSECURE_JWT_SECRETS:
                raise RuntimeError(
                    "JWT_SECRET_KEY is still the insecure default. Set a strong random "
                    "value in the environment before running in production."
                )
            if len(self.JWT_SECRET_KEY) < 32:
                raise RuntimeError(
                    "JWT_SECRET_KEY must be at least 32 characters in production."
                )
            # A wildcard origin with credentials lets any site drive the API
            # using a victim's browser. Starlette silently ignores the
            # combination, so fail loudly instead of shipping a broken policy.
            if "*" in self.CORS_ORIGINS:
                raise RuntimeError(
                    "CORS_ORIGINS must list explicit origins in production, not '*'."
                )
            if self.DEBUG:
                raise RuntimeError("DEBUG must be false in production.")

        # Gmail and Outlook display app passwords in space-separated groups
        # ("abcd efgh ijkl mnop"). Pasted verbatim they fail authentication,
        # which surfaces only as silently undelivered reset emails.
        if self.SMTP_PASSWORD:
            self.SMTP_PASSWORD = self.SMTP_PASSWORD.replace(" ", "").strip()
        if self.SMTP_HOST:
            self.SMTP_HOST = self._strip_wrapping_quotes(self.SMTP_HOST.strip()) or None

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
