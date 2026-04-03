import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import Base, engine
from app.routers import clients, ingestion, actuals
from app.routers import forecast as forecast_router
from app.routers import targets as targets_router

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


@app.get("/api/health")
def health():
    return {"status": "ok"}
