"""Catálogo de demostración: dos tonos WAV generados, sin música externa."""

import io
import math
import struct
import wave

from .database import Database
from .settings import Settings


def tone(frequency: int) -> bytes:
    buffer = io.BytesIO()
    sample_rate = 8000
    with wave.open(buffer, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        samples = (
            struct.pack("<h", round(2000 * math.sin(2 * math.pi * frequency * i / sample_rate)))
            for i in range(sample_rate)
        )
        output.writeframes(b"".join(samples))
    return buffer.getvalue()


def seed(database: Database):
    database.migrate()
    with database.connect() as connection:
        connection.execute("SELECT pg_advisory_xact_lock(72418012)")
        connection.execute(
            "INSERT INTO stations (id, name, description) VALUES (1, 'DAS Radio', "
            "'Catálogo de prueba con tonos generados') ON CONFLICT (id) DO NOTHING"
        )
        connection.execute(
            "INSERT INTO station_playback (station_id) VALUES (1) ON CONFLICT DO NOTHING"
        )
        for track_id, frequency in ((1, 440), (2, 660)):
            connection.execute(
                "INSERT INTO tracks (id, station_id, title, artist, duration_ms) "
                "VALUES (%s, 1, %s, 'Generador de prueba', 1000) ON CONFLICT (id) DO NOTHING",
                (track_id, f"Tono de prueba {frequency} Hz"),
            )
            connection.execute(
                "INSERT INTO track_audio (track_id, content_type, data) "
                "VALUES (%s, 'audio/wav', %s) ON CONFLICT DO NOTHING",
                (track_id, tone(frequency)),
            )
        for table in ("stations", "tracks"):
            # Nombres constantes, no entradas de usuario.
            connection.execute(
                f"SELECT setval(pg_get_serial_sequence(%s, 'id'), (SELECT max(id) FROM {table}))",
                (table,),
            )


if __name__ == "__main__":
    seed(Database(Settings.from_env().database_url))
    print("Catálogo de prueba disponible. No se ha modificado la reproducción existente.")
