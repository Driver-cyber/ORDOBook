import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import Base, engine
from app.routers import clients, ingestion, actuals
from app.routers import forecast as forecast_router
from app.routers import targets as targets_router
from app.routers import scenarios as scenarios_router
from app.routers import action_plan as action_plan_router
from app.routers import exports as exports_router

load_dotenv()

# Create tables on startup (Alembic handles migrations in production)
Base.metadata.create_all(bind=engine)

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


# ── Serve the built frontend (production / Electron) ────────────────────────
# In dev this is a NO-OP: the frontend runs on the Vite server (port 5173) and
# the build output doesn't exist, so this block is skipped. When packaged,
# FastAPI serves the built SPA so everything is same-origin on port 8000 and the
# relative /api paths resolve without a proxy. SPA deep links fall back to
# index.html (the app uses BrowserRouter).
_FRONTEND_DIST = os.getenv(
    "ORDOBOOK_FRONTEND_DIST",
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"),
)
if os.path.isdir(_FRONTEND_DIST):
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse, JSONResponse

    _assets_dir = os.path.join(_FRONTEND_DIST, "assets")
    if os.path.isdir(_assets_dir):
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

    _index_html = os.path.join(_FRONTEND_DIST, "index.html")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # Unknown /api/* paths stay JSON 404s, not the SPA shell
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        candidate = os.path.join(_FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(_index_html)
