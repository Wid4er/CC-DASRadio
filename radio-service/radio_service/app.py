import logging
import secrets
from contextlib import asynccontextmanager
from typing import Annotated, Literal

import psycopg
from fastapi import APIRouter, Depends, FastAPI, Path
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field

from .database import Database
from .domain import RadioError
from .repository import RadioRepository
from .seed import seed
from .settings import Settings

PositiveId = Annotated[int, Path(gt=0)]
security = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)


class Advance(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: Literal["initial", "track_finished"]


class Progress(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_track_id: Annotated[int, Field(strict=True, gt=0)]
    position_ms: Annotated[int, Field(strict=True, ge=0)]
    status: Literal["loading", "playing", "paused", "error"]


def error_response(status, code, message):
    headers = {"WWW-Authenticate": "Bearer"} if status == 401 else None
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message}},
        headers=headers,
    )


def create_app(settings: Settings | None = None):
    settings = settings or Settings.from_env()
    database = Database(settings.database_url)
    repository = RadioRepository(database)

    @asynccontextmanager
    async def lifespan(_app):
        database.migrate()
        if settings.seed_demo:
            seed(database)
        yield

    app = FastAPI(title="CC-DASRadio", version="0.1.0", lifespan=lifespan)

    def authenticate(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    ):
        if credentials is None or not secrets.compare_digest(
            credentials.credentials.encode(), settings.service_token.encode()
        ):
            raise RadioError(401, "unauthorized", "Credencial interna ausente o inválida.")

    @app.exception_handler(RadioError)
    async def radio_error_handler(_request, error):
        return error_response(error.status, error.code, error.message)

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_request, _error):
        return error_response(422, "invalid_payload", "La petición no es válida.")

    @app.exception_handler(psycopg.Error)
    async def database_error_handler(_request, error):
        logger.error("Fallo de PostgreSQL: %s", type(error).__name__)
        return error_response(503, "database_unavailable", "La base de datos no está disponible.")

    @app.exception_handler(Exception)
    async def unexpected_error_handler(_request, error):
        logger.error("Error interno: %s", type(error).__name__)
        return error_response(500, "internal_error", "No se pudo completar la operación.")

    @app.get("/health")
    def health():
        try:
            with database.connect() as connection:
                connection.execute("SELECT 1")
        except psycopg.Error:
            return JSONResponse(
                status_code=503,
                content={"status": "unavailable", "database": "unavailable"},
            )
        return {"status": "ok", "database": "available"}

    router = APIRouter(prefix="/api/v1", dependencies=[Depends(authenticate)])

    @router.get("/stations")
    def stations():
        return repository.stations()

    @router.get("/stations/{station_id}/playback")
    def playback(station_id: PositiveId):
        return repository.playback(station_id)

    @router.post("/stations/{station_id}/advance")
    def advance(station_id: PositiveId, payload: Advance):
        return repository.advance(station_id, payload.reason)

    @router.patch("/stations/{station_id}/playback")
    def progress(station_id: PositiveId, payload: Progress):
        return repository.progress(
            station_id, payload.current_track_id, payload.position_ms, payload.status
        )

    @router.get("/tracks/{track_id}/audio")
    def audio(track_id: PositiveId):
        data, content_type = repository.audio(track_id)
        return Response(content=data, media_type=content_type)

    app.include_router(router)
    return app
