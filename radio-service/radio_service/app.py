import asyncio
import logging
import secrets
import uuid
from contextlib import asynccontextmanager, suppress
from typing import Annotated, Literal

import psycopg
from fastapi import APIRouter, Depends, FastAPI, Path
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field

from .database import Database
from .domain import RadioError
from .playback import PlaybackController
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


class Listener(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["web", "discord"] = "web"


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
    controller = PlaybackController(repository)

    async def update_playback():
        while True:
            await asyncio.to_thread(controller.tick)
            await asyncio.sleep(0.25)

    @asynccontextmanager
    async def lifespan(_app):
        database.migrate()
        if settings.seed_demo:
            seed(database)
        timer = asyncio.create_task(update_playback())
        try:
            yield
        finally:
            timer.cancel()
            with suppress(asyncio.CancelledError):
                await timer
            await asyncio.to_thread(controller.close)

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
        return controller.external_change(
            station_id, lambda: repository.advance(station_id, payload.reason)
        )

    @router.patch("/stations/{station_id}/playback")
    def progress(station_id: PositiveId, payload: Progress):
        return controller.external_change(
            station_id, lambda: repository.progress(
                station_id, payload.current_track_id, payload.position_ms, payload.status
            )
        )

    @router.get("/stations/{station_id}/live")
    def live(station_id: PositiveId):
        return controller.call(station_id, "snapshot")

    @router.post("/stations/{station_id}/listeners", status_code=201)
    def join(station_id: PositiveId, payload: Listener):
        return controller.call(station_id, "join", payload.kind)

    @router.post("/stations/{station_id}/listeners/{listener_id}/heartbeat")
    def heartbeat(station_id: PositiveId, listener_id: uuid.UUID):
        return controller.call(station_id, "heartbeat", str(listener_id))

    @router.post("/stations/{station_id}/listeners/{listener_id}/leave")
    def leave(station_id: PositiveId, listener_id: uuid.UUID):
        return controller.call(station_id, "leave", str(listener_id))

    @router.get("/tracks/{track_id}/audio")
    def audio(track_id: PositiveId):
        data, content_type = repository.audio(track_id)
        return Response(content=data, media_type=content_type)

    app.include_router(router)
    return app
