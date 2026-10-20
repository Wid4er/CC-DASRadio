import os
import uuid
from concurrent.futures import ThreadPoolExecutor

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg import sql
from psycopg.conninfo import make_conninfo

from radio_service.app import create_app
from radio_service.database import Database
from radio_service.seed import seed
from radio_service.settings import Settings

pytestmark = pytest.mark.integration


@pytest.fixture
def settings():
    if os.environ.get("RUN_DB_TESTS") != "1":
        pytest.skip("Las pruebas PostgreSQL se ejecutan con RUN_DB_TESTS=1.")
    base = Settings.from_env()
    schema = "dasradio_test_" + uuid.uuid4().hex
    with psycopg.connect(base.database_url, autocommit=True) as connection:
        connection.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
    test_settings = Settings(
        make_conninfo(base.database_url, options=f"-csearch_path={schema}"), "test-only-token"
    )
    try:
        yield test_settings
    finally:
        # Únicamente el esquema aleatorio creado por esta prueba.
        with psycopg.connect(base.database_url, autocommit=True) as connection:
            connection.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))


@pytest.fixture
def client(settings):
    seed(Database(settings.database_url))
    with TestClient(create_app(settings)) as client:
        client.headers["Authorization"] = "Bearer test-only-token"
        yield client


def test_catalog_and_binary_audio_are_retrievable(client):
    assert client.get("/health").json()["database"] == "available"
    assert client.get("/api/v1/stations").json()[0]["id"] == 1
    idle = client.get("/api/v1/stations/1/playback").json()
    assert idle["status"] == "idle" and idle["track"] is None
    audio = client.get("/api/v1/tracks/1/audio")
    assert audio.status_code == 200
    assert audio.headers["content-type"] == "audio/wav"
    assert audio.content.startswith(b"RIFF")


def test_pause_survives_a_new_api_instance_and_seed_is_idempotent(client, settings):
    selected = client.post("/api/v1/stations/1/advance", json={"reason": "initial"}).json()
    payload = {
        "current_track_id": selected["current_track_id"],
        "position_ms": 500,
        "status": "paused",
    }
    assert client.patch("/api/v1/stations/1/playback", json=payload).status_code == 200
    seed(Database(settings.database_url))
    with TestClient(create_app(settings)) as restarted:
        response = restarted.get(
            "/api/v1/stations/1/playback",
            headers={"Authorization": "Bearer test-only-token"},
        ).json()
        assert response["current_track_id"] == payload["current_track_id"]
        assert response["position_ms"] == 500
        assert response["status"] == "paused"


def test_selection_conflicts_and_progress_are_checked(client):
    assert (
        client.post("/api/v1/stations/1/advance", json={"reason": "track_finished"}).status_code
        == 409
    )
    selected = client.post("/api/v1/stations/1/advance", json={"reason": "initial"}).json()
    assert client.post("/api/v1/stations/1/advance", json={"reason": "initial"}).status_code == 409
    payload = {
        "current_track_id": selected["current_track_id"],
        "position_ms": 1001,
        "status": "playing",
    }
    assert client.patch("/api/v1/stations/1/playback", json=payload).status_code == 422
    payload["position_ms"] = 0
    payload["current_track_id"] = 999
    assert client.patch("/api/v1/stations/1/playback", json=payload).status_code == 409


def test_empty_catalog_does_not_change_state(client, settings):
    with Database(settings.database_url).connect() as connection:
        connection.execute("UPDATE tracks SET enabled = false")
    result = client.post("/api/v1/stations/1/advance", json={"reason": "initial"})
    assert result.status_code == 409
    assert result.json()["error"]["code"] == "empty_catalog"
    assert client.get("/api/v1/stations/1/playback").json()["status"] == "idle"


def test_two_initial_requests_cannot_both_select_a_song(client):
    def initial_request(_):
        return client.post("/api/v1/stations/1/advance", json={"reason": "initial"}).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(initial_request, range(2)))
    assert sorted(results) == [200, 409]


def test_not_found_and_invalid_ids_use_contract_errors(client):
    assert client.get("/api/v1/stations/999/playback").status_code == 404
    assert client.get("/api/v1/tracks/999/audio").status_code == 404
    assert client.get("/api/v1/stations/0/playback").status_code == 422
