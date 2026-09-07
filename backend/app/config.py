"""Environment-backed runtime configuration for Tri-Netra."""
from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse


APP_ENV = os.getenv("TRINETRA_ENV", os.getenv("APP_ENV", "development")).strip().lower()
IS_PRODUCTION = (
    APP_ENV in {"production", "prod"}
    or os.getenv("RENDER", "").strip().lower() == "true"
    or bool(os.getenv("RAILWAY_ENVIRONMENT"))
)


def env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _production_value(name: str) -> str:
    value = os.getenv(name, "").strip()
    if IS_PRODUCTION and not value:
        raise RuntimeError(f"{name} is required in production")
    return value


def normalize_database_url(value: str) -> str:
    """Select psycopg v3 for the common hosted PostgreSQL URL forms."""
    if value.startswith("postgres://"):
        return value.replace("postgres://", "postgresql+psycopg://", 1)
    if value.startswith("postgresql://"):
        return value.replace("postgresql://", "postgresql+psycopg://", 1)
    return value


_backend_dir = Path(__file__).resolve().parents[1]
_is_vercel = bool(os.getenv("VERCEL"))
_local_database_path = Path(os.getenv("TMPDIR", "/tmp")) / "trinetra.db" if _is_vercel else _backend_dir / "trinetra.db"
_local_database = f"sqlite:///{_local_database_path.as_posix()}"
DATABASE_URL = normalize_database_url(_production_value("DATABASE_URL") or _local_database)
if IS_PRODUCTION and DATABASE_URL.startswith("sqlite"):
    raise RuntimeError("SQLite is not supported in production; configure PostgreSQL")

_development_jwt_secret = "trinetra-dev-secret-change-in-production"
JWT_SECRET = _production_value("JWT_SECRET") or _development_jwt_secret
if IS_PRODUCTION and (
    JWT_SECRET == _development_jwt_secret or len(JWT_SECRET) < 32
):
    raise RuntimeError("JWT_SECRET must be unique and at least 32 characters in production")


def _cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", os.getenv("CORS_ALLOWED_ORIGINS", "")).strip()
    if IS_PRODUCTION and not raw:
        raise RuntimeError("CORS_ORIGINS is required in production")
    if not raw:
        return [
            "http://localhost",
            "http://localhost:3000",
            "http://localhost:4173",
            "http://localhost:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:4173",
            "http://127.0.0.1:5173",
            "capacitor://localhost",
            "null",
        ]

    origins: list[str] = []
    for item in raw.split(","):
        origin = item.strip().rstrip("/")
        if not origin:
            continue
        parsed = urlparse(origin)
        valid_development_origin = not IS_PRODUCTION and origin in {
            "capacitor://localhost",
            "null",
        }
        if origin == "*" or (
            not valid_development_origin
            and (parsed.scheme not in {"http", "https"} or not parsed.netloc)
        ):
            raise RuntimeError(
                "CORS_ORIGINS must contain comma-separated exact http(s) origins"
            )
        if origin not in origins:
            origins.append(origin)

    if IS_PRODUCTION and not origins:
        raise RuntimeError("CORS_ORIGINS must contain at least one production origin")
    return origins


CORS_ORIGINS = _cors_origins()
AUTO_SEED_DATABASE = env_flag("AUTO_SEED_DATABASE", default=not IS_PRODUCTION)
