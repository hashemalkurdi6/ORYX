from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine, Base

# Import models to ensure they are registered with Base.metadata
from app.models import user, activity, health_data  # noqa: F401

from app.routers import auth, strava, health, diagnosis


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all database tables on startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Clean up engine on shutdown
    await engine.dispose()


app = FastAPI(
    title="ARMEN API",
    description="ARMEN Fitness Intelligence — powered by Strava and Claude AI",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
allowed_origins = [
    settings.FRONTEND_URL,
    "http://localhost:8081",
    "http://localhost:3000",
    "exp://localhost:8081",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"http://localhost:.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(strava.router)
app.include_router(health.router)
app.include_router(diagnosis.router)


@app.get("/", tags=["health-check"])
async def root():
    return {"status": "ok", "app": "ARMEN"}
