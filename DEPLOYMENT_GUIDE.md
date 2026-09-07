# Tri-Netra deployment guide

## Deployment architecture

The committed `vercel.json` provides a self-contained hosted demo. Vercel
Services deploys the React/Vite frontend and FastAPI backend together, routes
`/api/*` and `/ws/*` to FastAPI, and serves everything from one origin. Demo
instances use seeded SQLite under Vercel's ephemeral `/tmp` directory.

```text
Browser -> Vercel (Vite frontend and committed /gis assets)
        -> Vercel (FastAPI HTTP and WebSockets) -> ephemeral demo SQLite
```

For durable production data, configure hosted PostgreSQL and production secrets
or point the frontend at the `render.yaml` service. The WebSocket connection
manager is process-local, so a production backend should run one instance until
a shared pub/sub layer is added.

## Local development

Local development keeps SQLite and the Vite proxy:

```text
Browser -> Vite :5173 -> FastAPI :8000 -> SQLite
```

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal:

```powershell
cd frontend
npm ci
npm run dev
```

No frontend environment variable is required locally. Vite proxies `/api` and
`/ws`; committed assets under `frontend/public/gis` are served directly by Vite.

## Vercel hosted demo

Import `NishchalKap/Trinetra`, leave the Vercel project root at the repository
root, and use the committed `vercel.json`. It defines `frontend` and `backend`
services on the same public domain. No API URL is required for this mode; the
browser uses the same-origin `/api` route. To expose the quick demo accounts,
configure this public build variable for Production and Preview:

```text
VITE_ENABLE_DEMO_LOGIN=true
```

Set `APP_ENV=demo` for the current hosted demo. Its seeded SQLite database is
recreated on cold starts and must not be used for durable data. `HashRouter`
keeps application routes client-side. Vercel publishes the committed
`frontend/public/gis` GeoJSON and PNG assets at `/gis/*`.

To use an external Render backend instead, set
`VITE_API_BASE_URL=https://<your-render-host>`; the value may include `/api`.
Set `VITE_ENABLE_DEMO_LOGIN=false` when demo credentials must not be bundled.

## Render backend for durable production

`render.yaml` defines the backend-only service on `main`. The release command
installs backend dependencies, applies committed Alembic migrations, and only
then starts Uvicorn. Configure:

```text
APP_ENV=production
DATABASE_URL=postgresql://<hosted-postgresql-connection>
JWT_SECRET=<unique random value of at least 32 characters>
CORS_ORIGINS=https://<exact-vercel-or-custom-domain>
TRINETRA_ADMIN_PASSWORD=<unique value of at least 12 characters>
AUTO_SEED_DATABASE=true
```

`CORS_ORIGINS` is a comma-separated list of exact HTTPS origins without paths
or wildcards. Add each stable frontend origin that needs API and WebSocket
access. `CORS_ALLOWED_ORIGINS` remains a compatible alias. Do not invent a
domain before Vercel assigns it.

Optional accounts use `TRINETRA_FIELD_PASSWORD`,
`TRINETRA_DISTRICT_PASSWORD`, and `TRINETRA_CITIZEN_PASSWORD`; an account is
disabled in production if its password is unset. `GIS_ASSET_DIR` can override
the backend GIS directory with an existing absolute path. Without it, Render
serves the committed `frontend/public/gis` directory at `/gis/*`.

On a completely empty database, `AUTO_SEED_DATABASE=true` loads the existing
prototype seed dataset. Safe seeding skips the entire operation if any managed
application table already contains data. Set the variable to `false` after
initialization when production data is managed separately.

## PostgreSQL and Alembic

Production configuration fails closed when `DATABASE_URL`, `JWT_SECRET`,
`CORS_ORIGINS`, or the admin password is absent, and rejects SQLite. Standard
`postgres://` and `postgresql://` URLs are normalized for psycopg 3.

From `backend`, validate a clean local schema with:

```powershell
$env:DATABASE_URL = "sqlite:///./migration-check.db"
python -m alembic upgrade head
python -m alembic check
```

## Deployment verification

After both services are live, verify the final URLs rather than assuming that
a successful build means the system is operational:

- `/api/health`, login, and authenticated API requests
- dashboard, stations, alerts, reports, exports, satellite, flood, simulator
- `/gis/hillshade_overlay.png`, `/gis/slope_overlay.png`, and each map layer
- allowed Vercel origin and rejected unconfigured origin
- authenticated district-scoped WebSocket connection and ping/pong
