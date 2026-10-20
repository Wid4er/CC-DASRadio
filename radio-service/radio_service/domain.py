import random


class RadioError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status = status
        self.code = code
        self.message = message


def choose_track(track_ids: list[int]) -> int:
    if not track_ids:
        raise RadioError(409, "empty_catalog", "La emisora no tiene canciones disponibles.")
    return random.choice(track_ids)


def validate_progress(current_status: str, status: str, position: int, duration: int):
    if not 0 <= position <= duration:
        raise RadioError(422, "invalid_payload", "La posición está fuera de la canción.")
    transitions = {
        "loading": {"loading", "playing", "paused", "error"},
        "playing": {"playing", "paused", "error"},
        "paused": {"paused", "playing", "error"},
        "error": {"error", "loading", "paused"},
    }
    if status not in transitions.get(current_status, set()):
        raise RadioError(409, "state_conflict", "La transición de reproducción no es válida.")
