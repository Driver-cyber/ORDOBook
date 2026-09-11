import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import Base, engine
from app.db_migrate import auto_migrate_if_enabled
from app.routers import clients, ingestion, actuals
from app.routers import forecast as forecast_router
from app.routers import targets as targets_router
from app.routers import scenarios as scenarios_router
from app.routers import action_plan as action_plan_router
from app.routers import exports as exports_router

load_dotenv()

# Bring the database to head BEFORE create_all, in dev and packaged alike, so
# Alembic's ledger always matches reality and new columns land without a manual
# 'alembic upgrade head'. ORDOBOOK_AUTO_MIGRATE=0 opts out.
auto_migrate_if_enabled()
print("[ordobook] migrations: at head", flush=True)

# Bootstrap a fresh dev DB from the models. In the packaged app the migration
# above has already built the schema, so this is a no-op.
Base.metadata.create_all(bind=engine)
print("[ordobook] schema ready — starting API", flush=True)

app = FastAPI(title="ORDOBOOK API", version="0.1.0")

# CORS — allow the Vite dev server (and future production origin)
origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(clients.router)
app.include_router(ingestion.router)
app.include_router(actuals.router)
app.include_router(forecast_router.router)
app.include_router(targets_router.router)
app.include_router(scenarios_router.router)
app.include_router(action_plan_router.router)
app.include_router(exports_router.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


def register_spa(app: FastAPI) -> None:
    """Serve the built React SPA when a frontend build exists (production/Electron).

    No-op in dev: the frontend runs on the Vite server (port 5173) and the build
    output doesn't exist, so this returns early. When packaged, FastAPI serves the
    built SPA so everything is same-origin on port 8000 and the relative /api paths
    resolve without a proxy. SPA deep links fall back to index.html (the app uses
    BrowserRouter).
    """
    frontend_dist = os.getenv(
        "ORDOBOOK_FRONTEND_DIST",
        os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"),
    )
    if not os.path.isdir(frontend_dist):
        return

    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse, JSONResponse

    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    index_html = os.path.join(frontend_dist, "index.html")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # Unknown /api/* paths stay JSON 404s, not the SPA shell
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        candidate = os.path.join(frontend_dist, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(index_html)


register_spa(app)
