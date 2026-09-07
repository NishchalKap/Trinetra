"""Deployment configuration and transport security checks."""
from __future__ import annotations

import os
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app
from app.database import SessionLocal
from app.models import (
    Alert,
    CitizenReport,
    RiskAssessment,
    RoadStatus,
    SensorReading,
    SensorStation,
    Village,
    WeatherData,
)


client = TestClient(app)


def _config_process(
    extra: dict[str, str],
    remove: tuple[str, ...] = (),
    code: str = "from app.config import DATABASE_URL; print(DATABASE_URL)",
) -> subprocess.CompletedProcess[str]:
    environment = os.environ.copy()
    environment.update(extra)
    for name in remove:
        environment.pop(name, None)
    return subprocess.run(
        [sys.executable, "-c", code],
        cwd=os.path.dirname(os.path.dirname(__file__)),
        env=environment,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=20,
    )


class TestProductionConfiguration:
    production = {
        "APP_ENV": "production",
        "JWT_SECRET": "a-unique-production-secret-that-is-long-enough",
        "CORS_ORIGINS": "https://frontend.example.com",
        "TRINETRA_ADMIN_PASSWORD": "a-strong-admin-password",
    }

    def test_missing_database_url_fails_closed(self):
        result = _config_process(self.production, remove=("DATABASE_URL",))
        assert result.returncode != 0
        assert "DATABASE_URL is required" in result.stderr

    def test_production_sqlite_is_rejected(self):
        result = _config_process({**self.production, "DATABASE_URL": "sqlite:///unsafe.db"})
        assert result.returncode != 0
        assert "SQLite is not supported" in result.stderr

    def test_missing_jwt_secret_fails_closed(self):
        result = _config_process(
            {**self.production, "DATABASE_URL": "postgresql://host/db"},
            remove=("JWT_SECRET",),
        )
        assert result.returncode != 0
        assert "JWT_SECRET is required" in result.stderr

    def test_missing_cors_origins_fails_closed(self):
        result = _config_process(
            {**self.production, "DATABASE_URL": "postgresql://host/db"},
            remove=("CORS_ORIGINS", "CORS_ALLOWED_ORIGINS"),
        )
        assert result.returncode != 0
        assert "CORS_ORIGINS is required" in result.stderr

    def test_missing_admin_password_fails_closed(self):
        result = _config_process(
            {**self.production, "DATABASE_URL": "postgresql://host/db"},
            remove=("TRINETRA_ADMIN_PASSWORD",),
            code="from app.auth import DEMO_USERS; print(len(DEMO_USERS))",
        )
        assert result.returncode != 0
        assert "TRINETRA_ADMIN_PASSWORD is required" in result.stderr

    def test_hosted_postgresql_url_uses_psycopg(self):
        result = _config_process({**self.production, "DATABASE_URL": "postgres://host/db"})
        assert result.returncode == 0, result.stderr
        assert result.stdout.strip() == "postgresql+psycopg://host/db"

    def test_wildcard_production_cors_is_rejected(self):
        result = _config_process(
            {
                **self.production,
                "DATABASE_URL": "postgresql://host/db",
                "CORS_ORIGINS": "*",
            }
        )
        assert result.returncode != 0
        assert "exact http(s) origins" in result.stderr

    def test_vercel_demo_uses_ephemeral_sqlite(self, tmp_path):
        result = _config_process(
            {"APP_ENV": "demo", "VERCEL": "1", "TMPDIR": str(tmp_path)},
            remove=("DATABASE_URL",),
        )
        assert result.returncode == 0, result.stderr
        assert result.stdout.strip().endswith("/trinetra.db")
        assert tmp_path.as_posix() in result.stdout.strip()

    def test_vercel_demo_boots_and_accepts_demo_login(self, tmp_path):
        result = _config_process(
            {"APP_ENV": "demo", "VERCEL": "1", "TMPDIR": str(tmp_path)},
            remove=("DATABASE_URL",),
            code=(
                "from fastapi.testclient import TestClient; "
                "from app.main import app; "
                "response = TestClient(app).post('/api/auth/login', "
                "data={'email': 'admin@trinetra.gov.in', 'password': 'admin123'}); "
                "print(response.status_code, response.json()['user']['role'])"
            ),
        )
        assert result.returncode == 0, result.stderr
        assert result.stdout.strip().endswith("200 admin")


class TestOriginAndWebSocketSecurity:
    def test_cors_allows_configured_local_origin(self):
        response = client.options(
            "/api/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == "http://localhost:5173"

    def test_cors_does_not_allow_unconfigured_origin(self):
        response = client.options(
            "/api/health",
            headers={
                "Origin": "https://unconfigured.example.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert "access-control-allow-origin" not in response.headers

    def test_websocket_rejects_invalid_origin(self):
        with pytest.raises(WebSocketDisconnect) as exc:
            with client.websocket_connect(
                "/ws/alerts/all?token=invalid",
                headers={"Origin": "https://unconfigured.example.com"},
            ):
                pass
        assert exc.value.code == 1008

    def test_websocket_allows_same_origin(self):
        login = client.post(
            "/api/auth/login",
            data={"email": "admin@trinetra.gov.in", "password": "admin123"},
        )
        token = login.json()["token"]
        with client.websocket_connect(
            f"/ws/alerts/all?token={token}",
            headers={"Origin": "http://testserver"},
        ) as websocket:
            assert websocket.receive_json()["type"] == "connected"

    def test_authenticated_websocket_ping_pong(self):
        login = client.post(
            "/api/auth/login",
            data={"email": "admin@trinetra.gov.in", "password": "admin123"},
        )
        token = login.json()["token"]
        with client.websocket_connect(
            f"/ws/alerts/all?token={token}",
            headers={"Origin": "http://localhost:5173"},
        ) as websocket:
            assert websocket.receive_json()["type"] == "connected"
            websocket.send_text("ping")
            assert websocket.receive_json() == {"type": "pong"}

    def test_websocket_enforces_district_scope(self):
        login = client.post(
            "/api/auth/login",
            data={"email": "field@trinetra.gov.in", "password": "field123"},
        )
        token = login.json()["token"]
        with pytest.raises(WebSocketDisconnect) as exc:
            with client.websocket_connect(
                f"/ws/alerts/Mangan?token={token}",
                headers={"Origin": "http://localhost:5173"},
            ):
                pass
        assert exc.value.code == 4403


class TestDeploymentDataSafety:
    managed_models = (
        Alert,
        RiskAssessment,
        SensorReading,
        WeatherData,
        RoadStatus,
        Village,
        CitizenReport,
        SensorStation,
    )

    def test_safe_seed_does_not_reset_existing_data(self):
        from app.seed_data import seed_database

        with SessionLocal() as database:
            before = {model.__tablename__: database.query(model).count() for model in self.managed_models}
        assert any(before.values())

        seed_database(force=False)

        with SessionLocal() as database:
            after = {model.__tablename__: database.query(model).count() for model in self.managed_models}
        assert after == before

    def test_static_path_cannot_escape_frontend_directory(self):
        response = client.get("/..%2F..%2Fbackend%2Fapp%2Fauth.py")
        assert "JWT Authentication for Tri-Netra API" not in response.text
