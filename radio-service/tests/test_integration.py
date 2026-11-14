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
from radio_service.import_audio import import_track
from radio_service.repository import RadioRepository
from radio_service.seed import seed, tone
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


def test_intermission_is_persisted_and_api_clients_wait_before_playing(client, settings):
    repository = RadioRepository(Database(settings.database_url))
    repository.advance(1, "initial")
    queued = repository.advance(1, "track_finished", intermission_remaining_ms=5000)
    assert queued["intermission_remaining_ms"] == 5000
    # El primer acceso recupera el punto sin inventar conexiones anteriores.
    live = client.get("/api/v1/stations/1/live").json()
    assert live["status"] == "paused"
    assert live["intermission_remaining_ms"] == 5000
    joined = client.post("/api/v1/stations/1/listeners", json={"kind": "web"}).json()
    assert joined["state"]["status"] == "loading"
    assert joined["state"]["position_ms"] == 0
    assert 0 < joined["state"]["intermission_remaining_ms"] <= 5000
    paused = client.post(
        f"/api/v1/stations/1/listeners/{joined['listener_id']}/leave"
    ).json()
    assert paused["status"] == "paused"
    persisted = repository.playback(1)
    assert persisted["intermission_remaining_ms"] == paused["intermission_remaining_ms"]
    assert persisted["current_track_id"] == queued["current_track_id"]


def test_live_api_shares_web_and_discord_and_guards_legacy_writes(client):
    base = "/api/v1/stations/1"
    web = client.post(base + "/listeners", json={"kind": "web"})
    assert web.status_code == 201
    discord = client.post(base + "/listeners", json={"kind": "discord"}).json()
    assert discord["state"]["playback_id"] == web.json()["state"]["playback_id"]
    assert discord["state"]["listeners"] == 2
    assert client.post(base + "/advance", json={"reason": "track_finished"}).status_code == 409
    assert client.get(base + "/live").json()["discord_connections"] == 1
    assert client.post(base + "/listeners/" + web.json()["listener_id"] + "/leave").json()[
        "status"
    ] == "playing"
    session = base + "/listeners/" + discord["listener_id"]
    assert client.post(session + "/heartbeat").status_code == 200
    assert client.post(session + "/leave").json()["status"] == "paused"
    assert client.post(session + "/heartbeat").status_code == 410
    # La salida repetida es inocua y el UUID se valida antes de consultar la emisora.
    assert client.post(session + "/leave").status_code == 200
    assert client.post(base + "/listeners/invalid/leave").status_code == 422
    assert client.post(base + "/listeners", json={"kind": "other"}).status_code == 422


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


def test_import_preserves_encoded_bytes_and_deduplicates(client, settings):
    database = Database(settings.database_url)
    data = tone(880)
    args = (database, 1, "Audio importado", "Prueba", 1000, data, "audio/wav")
    imported = import_track(*args)
    repeated = import_track(*args)
    assert imported["created"] is True
    assert repeated["created"] is False
    assert repeated["track_id"] == imported["track_id"]
    response = client.get(f"/api/v1/tracks/{imported['track_id']}/audio")
    assert response.content == data
    assert response.headers["content-type"] == "audio/wav"


def test_replace_demo_only_disables_original_tones_and_resets_their_paused_point(client, settings):
    database = Database(settings.database_url)
    selected = client.post("/api/v1/stations/1/advance", json={"reason": "initial"}).json()
    client.patch("/api/v1/stations/1/playback", json={
        "current_track_id": selected["current_track_id"], "position_ms": 500, "status": "paused"
    })
    imported = import_track(database, 1, "Nueva", "Prueba", 1000, tone(880), "audio/wav", True)
    assert imported["disabled_demo_ids"] == [1, 2]
    assert client.get("/api/v1/stations/1/playback").json()["status"] == "idle"
    next_track = client.post("/api/v1/stations/1/advance", json={"reason": "initial"}).json()
    assert next_track["current_track_id"] == imported["track_id"]
    # Las filas originales se conservan, pero quedan fuera de la selección.
    with database.connect() as connection:
        assert connection.execute("SELECT count(*) AS n FROM tracks").fetchone()["n"] == 3


def test_replace_demo_refuses_to_interrupt_an_active_tone(client, settings):
    selected = client.post("/api/v1/stations/1/advance", json={"reason": "initial"}).json()
    with pytest.raises(ValueError, match="Pausa"):
        import_track(Database(settings.database_url), 1, "Nueva", "Prueba", 1000,
                     tone(880), "audio/wav", True)
    state = client.get("/api/v1/stations/1/playback").json()
    assert state["current_track_id"] == selected["current_track_id"]
