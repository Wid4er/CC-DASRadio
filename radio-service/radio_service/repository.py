from .database import Database
from .domain import RadioError, choose_track, validate_progress

PLAYBACK_QUERY = """
SELECT p.station_id, p.current_track_id, p.position_ms, p.status, p.updated_at,
       t.title, t.artist, t.duration_ms, a.content_type
FROM station_playback p
JOIN stations s ON s.id = p.station_id
LEFT JOIN tracks t ON t.id = p.current_track_id
LEFT JOIN track_audio a ON a.track_id = t.id
WHERE p.station_id = %s AND s.enabled
"""


def playback_payload(row):
    if row is None:
        raise RadioError(404, "station_not_found", "No se encuentra la emisora.")
    result = {
        key: row[key]
        for key in ("station_id", "current_track_id", "position_ms", "status", "updated_at")
    }
    result["track"] = None
    if row["current_track_id"] is not None:
        result["track"] = {
            "id": row["current_track_id"],
            **{key: row[key] for key in ("title", "artist", "duration_ms", "content_type")},
        }
    return result


class RadioRepository:
    def __init__(self, database: Database):
        self.database = database

    def stations(self):
        with self.database.connect() as connection:
            return connection.execute(
                "SELECT id, name, description, enabled FROM stations WHERE enabled ORDER BY id"
            ).fetchall()

    def playback(self, station_id: int):
        with self.database.connect() as connection:
            return playback_payload(connection.execute(PLAYBACK_QUERY, (station_id,)).fetchone())

    @staticmethod
    def lock_station(connection, station_id):
        station = connection.execute(
            "SELECT id FROM stations WHERE id = %s AND enabled FOR UPDATE", (station_id,)
        ).fetchone()
        if station is None:
            raise RadioError(404, "station_not_found", "No se encuentra la emisora.")

    def advance(self, station_id: int, reason: str):
        with self.database.connect() as connection:
            self.lock_station(connection, station_id)
            state = connection.execute(PLAYBACK_QUERY, (station_id,)).fetchone()
            if state is None:
                raise RadioError(404, "station_not_found", "No se encuentra la emisora.")
            if (reason == "initial") != (state["current_track_id"] is None):
                raise RadioError(409, "state_conflict", "La selección no corresponde al estado.")
            candidates = connection.execute(
                "SELECT id FROM tracks WHERE station_id = %s AND enabled ORDER BY id",
                (station_id,),
            ).fetchall()
            track_id = choose_track([row["id"] for row in candidates])
            connection.execute(
                "UPDATE station_playback SET current_track_id = %s, position_ms = 0, "
                "status = 'loading', updated_at = now() WHERE station_id = %s",
                (track_id, station_id),
            )
            return playback_payload(connection.execute(PLAYBACK_QUERY, (station_id,)).fetchone())

    def progress(self, station_id: int, track_id: int, position: int, status: str):
        with self.database.connect() as connection:
            self.lock_station(connection, station_id)
            state = connection.execute(PLAYBACK_QUERY, (station_id,)).fetchone()
            if state is None or state["current_track_id"] != track_id:
                raise RadioError(409, "state_conflict", "La canción no es la selección actual.")
            validate_progress(state["status"], status, position, state["duration_ms"])
            row = connection.execute(
                "UPDATE station_playback SET position_ms = %s, status = %s, updated_at = now() "
                "WHERE station_id = %s RETURNING station_id, current_track_id, position_ms, "
                "status, updated_at",
                (position, status, station_id),
            ).fetchone()
            return row

    def audio(self, track_id: int):
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT a.data, a.content_type FROM tracks t "
                "JOIN stations s ON s.id = t.station_id "
                "LEFT JOIN track_audio a ON a.track_id = t.id "
                "WHERE t.id = %s AND t.enabled AND s.enabled",
                (track_id,),
            ).fetchone()
            if row is None:
                raise RadioError(404, "track_not_found", "No se encuentra la canción.")
            if not row["data"] or not row["content_type"]:
                raise RadioError(500, "audio_unavailable", "El audio no está disponible.")
            return bytes(row["data"]), row["content_type"]
