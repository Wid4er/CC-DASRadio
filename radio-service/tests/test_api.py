from fastapi.testclient import TestClient

from radio_service.app import create_app
from radio_service.repository import RadioRepository
from radio_service.settings import Settings

SETTINGS = Settings("host=127.0.0.1 port=1 connect_timeout=1", "test-only-token")


def test_internal_api_requires_a_token():
    client = TestClient(create_app(SETTINGS))
    assert client.get("/api/v1/stations").status_code == 401
    assert (
        client.get("/api/v1/stations", headers={"Authorization": "Bearer incorrecto"}).status_code
        == 401
    )


def test_health_returns_unavailable_when_database_is_down():
    client = TestClient(create_app(SETTINGS))
    response = client.get("/health")
    assert response.status_code == 503
    assert response.json() == {"status": "unavailable", "database": "unavailable"}


def test_invalid_progress_has_contract_error_format():
    client = TestClient(create_app(SETTINGS))
    response = client.patch(
        "/api/v1/stations/1/playback",
        headers={"Authorization": "Bearer test-only-token"},
        json={"current_track_id": 1, "position_ms": True, "status": "playing"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_payload"


def test_unexpected_errors_use_contract_without_internal_details(monkeypatch):
    def failing_query(_repository):
        raise RuntimeError("detalle-interno-de-prueba")

    monkeypatch.setattr(RadioRepository, "stations", failing_query)
    client = TestClient(create_app(SETTINGS), raise_server_exceptions=False)
    response = client.get("/api/v1/stations", headers={"Authorization": "Bearer test-only-token"})
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal_error"
    assert "detalle-interno-de-prueba" not in response.text
