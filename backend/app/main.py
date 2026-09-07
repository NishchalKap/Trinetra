"""
Tri-Netra - AI-Based Early Warning and Landslide Risk Monitoring System
Backend API Server for Smart India Hackathon 2026
"""
import os
import sys
import logging
from urllib.parse import urlparse

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.staticfiles import StaticFiles
from starlette.responses import FileResponse
from app.middleware.rate_limiter import RateLimiter

from app.database import engine, Base
from app.routers import sensors, dashboard, alerts, reports, weather, simulator, satellite, predict, alerts_timeline, flood, ml_enhanced, segmentation, dispatch, scout
from app.auth import authenticate_user, create_token, verify_token
from app.websocket_manager import can_subscribe, manager, normalize_district
from app.config import AUTO_SEED_DATABASE, CORS_ORIGINS, IS_PRODUCTION

logger = logging.getLogger("trinetra")

def init_database():
    # Production migrations are an explicit release command. A failed migration
    # must stop deployment instead of falling back to create_all.
    if not IS_PRODUCTION:
        Base.metadata.create_all(bind=engine)

    if not AUTO_SEED_DATABASE:
        logger.info("Automatic database seeding is disabled")
        return

    from app.seed_data import seed_database
    seed_database(force=False)
    print("[Tri-Netra] ✅ Database ready")

    # Auto-refresh satellite data if stale (>6 hours old)
    try:
        import json as _json
        from datetime import datetime as _dt, timedelta as _td
        sat_path = os.path.join(os.path.dirname(__file__), "..", "..", "datasets", "processed", "real_satellite_data.json")
        if os.path.exists(sat_path):
            with open(sat_path) as f:
                sat_data = _json.load(f)
            if sat_data:
                last_update = sat_data[0].get("last_updated", "")
                if last_update:
                    try:
                        last_dt = _dt.fromisoformat(last_update)
                        if _dt.utcnow() - last_dt > _td(hours=6):
                            print("[Tri-Netra] 🛰️  Satellite data stale (>6h), run 'python datasets/download_real_data.py' to refresh")
                        else:
                            print(f"[Tri-Netra] 🛰️  Satellite data fresh (updated {last_update})")
                    except (ValueError, TypeError):
                        pass
    except Exception as e:
        print(f"[Tri-Netra] ⚠️  Satellite check skipped: {e}")


init_database()

FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))

app = FastAPI(
    title="Tri-Netra API",
    description="AI-Based Early Warning and Landslide Risk Monitoring System for NER",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)
app.add_middleware(RateLimiter)

app.include_router(sensors.router)
app.include_router(dashboard.router)
app.include_router(alerts.router)
app.include_router(reports.router)
app.include_router(weather.router)
app.include_router(simulator.router)
app.include_router(satellite.router)
app.include_router(predict.router)
app.include_router(alerts_timeline.router)
app.include_router(flood.router)
app.include_router(ml_enhanced.router)
app.include_router(segmentation.router)
app.include_router(dispatch.router)
app.include_router(scout.router)


@app.get("/health", response_class=JSONResponse)
@app.get("/api/health", response_class=JSONResponse)
def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


@app.post("/api/auth/login")
async def login(request: Request):
    content_type = request.headers.get("content-type", "")
    email = ""
    password = ""
    if "application/json" in content_type:
        try:
            body = await request.json()
            email = body.get("email", "")
            password = body.get("password", "")
        except Exception:
            pass
    if not email or not password:
        try:
            form = await request.form()
            email = form.get("email", "")
            password = form.get("password", "")
        except Exception:
            pass

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    user = authenticate_user(email, password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user)
    return {
        "token": token,
        "user": {
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "districts": user.get("districts", []),
        },
    }


def _websocket_user(websocket: WebSocket) -> dict:
    """Authenticate browser query tokens or non-browser Authorization headers."""
    token = websocket.query_params.get("token")
    authorization = websocket.headers.get("authorization", "")
    if not token and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    return verify_token(token)


def _websocket_origin_allowed(websocket: WebSocket) -> bool:
    origin = (websocket.headers.get("origin") or "").rstrip("/")
    if not origin:
        return not IS_PRODUCTION
    request_host = (websocket.headers.get("host") or "").lower()
    same_origin = urlparse(origin).netloc.lower() == request_host
    return same_origin or origin in CORS_ORIGINS


async def _serve_alert_socket(websocket: WebSocket, requested_district: str) -> None:
    if not _websocket_origin_allowed(websocket):
        await websocket.close(code=1008, reason="Origin not allowed")
        return
    try:
        user = _websocket_user(websocket)
        district = normalize_district(requested_district)
        if not can_subscribe(user, district):
            await websocket.close(code=4403, reason="District subscription not authorized")
            return
    except (HTTPException, ValueError) as exc:
        reason = exc.detail if isinstance(exc, HTTPException) else str(exc)
        await websocket.close(code=4401, reason=reason)
        return

    await manager.connect(websocket, district=district, user=user)
    try:
        await websocket.send_json({"type": "connected", "district": district})
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({"type": "pong"})
            elif data.startswith("subscribe:"):
                new_district = normalize_district(data.split(":", 1)[1])
                if not can_subscribe(user, new_district):
                    await websocket.send_json({"type": "error", "message": "District subscription not authorized"})
                    continue
                manager.subscribe(websocket, new_district)
                await websocket.send_json({"type": "subscribed", "district": new_district})
    except (WebSocketDisconnect, ValueError):
        pass
    finally:
        manager.disconnect(websocket)


@app.websocket("/ws/alerts/{district}")
async def websocket_alerts(websocket: WebSocket, district: str = "all"):
    """District-scoped WebSocket for real-time alert broadcasting."""
    await _serve_alert_socket(websocket, district)


@app.websocket("/ws/alerts")
async def websocket_alerts_all(websocket: WebSocket):
    """Legacy endpoint - connects to all districts."""
    await _serve_alert_socket(websocket, "all")


# Serve the committed GIS assets for backend-hosted and smoke-test deployments.
# Vercel serves the same files directly from frontend/public/gis.
_repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_configured_gis_dir = os.getenv("GIS_ASSET_DIR", "").strip()
if _configured_gis_dir:
    GIS_DIR = os.path.abspath(_configured_gis_dir)
    if not os.path.isdir(GIS_DIR):
        raise RuntimeError("GIS_ASSET_DIR must point to an existing directory")
else:
    GIS_DIR = os.path.join(_repo_root, "frontend", "public", "gis")

if os.path.isdir(GIS_DIR):
    app.mount("/gis", StaticFiles(directory=GIS_DIR), name="gis")
elif IS_PRODUCTION:
    raise RuntimeError("Required GIS assets are unavailable")


# Serve frontend static files
if os.path.exists(os.path.join(FRONTEND_DIR, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIR, "assets")), name="assets")

if os.path.exists(FRONTEND_DIR):
    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_frontend(full_path: str):
        # Skip ALL API, WebSocket, and health routes - never return HTML for these
        if (full_path.startswith("api/") or full_path.startswith("ws")
            or full_path.startswith("gis/") or full_path == "gis"
            or full_path == "health" or full_path == "api"):
            return JSONResponse({"message": "API endpoint not found", "path": full_path}, status_code=404)
        # Sanitize path to prevent path traversal attacks
        if full_path:
            normalized = os.path.normpath(full_path).lstrip(os.sep)
            if normalized.startswith("..") or os.path.isabs(normalized):
                return {"message": "Not found", "version": "1.0.0"}
            file_path = os.path.join(FRONTEND_DIR, normalized)
            # Ensure resolved path stays within FRONTEND_DIR
            if os.path.commonpath([os.path.abspath(file_path), FRONTEND_DIR]) != FRONTEND_DIR:
                return {"message": "Not found", "version": "1.0.0"}
            if os.path.isfile(file_path):
                return FileResponse(file_path)
        # Serve index.html for all other routes (SPA routing)
        index_path = os.path.join(FRONTEND_DIR, "index.html")
        if os.path.isfile(index_path):
            return FileResponse(index_path)
        return {"message": "Tri-Netra API", "version": "1.0.0"}
