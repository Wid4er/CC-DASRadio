"""Carga local de archivos codificados; solo radio-service accede a PostgreSQL."""

import argparse
import hashlib
import json
import sys

import psycopg

from .database import Database
from .domain import RadioError
from .repository import RadioRepository
from .seed import tone
from .settings import Settings

MAX_AUDIO_BYTES = 32 * 1024 * 1024


def import_track(database, station_id, title, artist, duration_ms, data,
                 content_type="audio/mpeg", replace_demo=False):
    if type(station_id) is not int or station_id < 1:
        raise ValueError("La emisora debe ser un entero positivo.")
    if not title.strip() or not artist.strip() or max(len(title), len(artist)) > 500:
        raise ValueError("Título y artista deben tener entre 1 y 500 caracteres.")
    if type(duration_ms) is not int or duration_ms < 1:
        raise ValueError("La duración debe ser un entero positivo en milisegundos.")
    if not 0 < len(data) <= MAX_AUDIO_BYTES:
        raise ValueError("El archivo debe ocupar entre 1 byte y 32 MiB.")
    valid_mp3 = data.startswith(b"ID3") or (
        len(data) >= 2 and data[0] == 0xFF and data[1] & 0xE0 == 0xE0
    )
    valid_wav = data.startswith(b"RIFF") and data[8:12] == b"WAVE"
    if not ((content_type == "audio/mpeg" and valid_mp3)
            or (content_type == "audio/wav" and valid_wav)):
        raise ValueError("La cabecera del archivo no corresponde al tipo de audio.")

    with database.connect() as connection:
        RadioRepository.lock_station(connection, station_id)
        disabled = []
        if replace_demo:
            for track_id, frequency in ((1, 440), (2, 660)):
                # Solo los tonos exactos del seed, nunca archivos personalizados.
                original = connection.execute(
                    "SELECT t.id FROM tracks t JOIN track_audio a ON a.track_id = t.id "
                    "WHERE t.station_id = %s AND t.id = %s AND t.duration_ms = 1000 "
                    "AND t.artist = 'Generador de prueba' AND t.title = %s "
                    "AND a.content_type = 'audio/wav' AND a.data = %s",
                    (station_id, track_id, f"Tono de prueba {frequency} Hz", tone(frequency)),
                ).fetchone()
                if original:
                    disabled.append(track_id)
            if disabled:
                playback = connection.execute(
                    "SELECT current_track_id, status FROM station_playback WHERE station_id = %s",
                    (station_id,),
                ).fetchone()
                if (playback and playback["current_track_id"] in disabled
                        and playback["status"] in {"playing", "loading"}):
                    raise ValueError("Pausa la emisora antes de sustituir sus tonos de prueba.")
                connection.execute(
                    "UPDATE tracks SET enabled = false WHERE station_id = %s AND id = ANY(%s)",
                    (station_id, disabled),
                )
                connection.execute(
                    "UPDATE station_playback SET current_track_id = NULL, position_ms = 0, "
                    "status = 'idle', intermission_remaining_ms = 0, updated_at = now() "
                    "WHERE station_id = %s AND current_track_id = ANY(%s)",
                    (station_id, disabled),
                )
        existing = connection.execute(
            "SELECT t.id FROM tracks t JOIN track_audio a ON a.track_id = t.id "
            "WHERE t.station_id = %s AND a.data = %s ORDER BY t.id LIMIT 1",
            (station_id, data),
        ).fetchone()
        if existing:
            track_id = existing["id"]
        else:
            track_id = connection.execute(
                "INSERT INTO tracks (station_id, title, artist, duration_ms) "
                "VALUES (%s, %s, %s, %s) RETURNING id",
                (station_id, title.strip(), artist.strip(), duration_ms),
            ).fetchone()["id"]
            connection.execute(
                "INSERT INTO track_audio (track_id, content_type, data) VALUES (%s, %s, %s)",
                (track_id, content_type, data),
            )
    return {
        "track_id": track_id, "created": existing is None, "title": title,
        "artist": artist, "duration_ms": duration_ms, "content_type": content_type,
        "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
        "disabled_demo_ids": disabled,
    }


def main():
    parser = argparse.ArgumentParser(description="Importa audio codificado desde stdin.")
    parser.add_argument("--station-id", type=int, default=1)
    parser.add_argument("--title", required=True)
    parser.add_argument("--artist", required=True)
    parser.add_argument("--duration-ms", type=int, required=True)
    parser.add_argument("--content-type", default="audio/mpeg")
    parser.add_argument("--replace-demo", action="store_true")
    args = parser.parse_args()
    database = Database(Settings.from_env().database_url)
    database.migrate()
    result = import_track(
        database, args.station_id, args.title, args.artist, args.duration_ms,
        sys.stdin.buffer.read(MAX_AUDIO_BYTES + 1), args.content_type, args.replace_demo,
    )
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except ValueError as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
    except (OSError, psycopg.Error, RadioError):
        print("Error: no se pudo completar la importación en PostgreSQL.", file=sys.stderr)
        sys.exit(1)
