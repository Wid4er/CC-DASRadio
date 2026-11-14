"""Importa MP3 locales a través del contenedor radio-service, sin recodificarlos."""

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

MAX_AUDIO_BYTES = 32 * 1024 * 1024


def inspect_mp3(path):
    if not path.is_file() or not 0 < path.stat().st_size <= MAX_AUDIO_BYTES:
        raise ValueError(f"No existe el archivo o supera los 32 MiB: {path.name}")
    probe = subprocess.run([
        "ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
        "stream=codec_name:format=duration:format_tags=title,artist", "-of", "json", str(path),
    ], capture_output=True, text=True, timeout=30, check=True)
    metadata = json.loads(probe.stdout)
    if len(metadata.get("streams", [])) != 1 or metadata["streams"][0]["codec_name"] != "mp3":
        raise ValueError(f"El archivo no contiene una pista MP3 reconocida: {path.name}")
    duration = Decimal(metadata["format"]["duration"]) * 1000
    if not duration.is_finite() or duration < 1:
        raise ValueError(f"Duración inválida: {path.name}")
    tags = {key.lower(): value for key, value in metadata["format"].get("tags", {}).items()}
    return {
        "title": tags.get("title", "").strip() or path.stem,
        "artist": tags.get("artist", "").strip() or "Artista desconocido",
        "duration_ms": int(duration.to_integral_value()),
    }


def main():
    parser = argparse.ArgumentParser(
        description="Carga MP3 sin convertirlos ni copiar credenciales."
    )
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--station-id", type=int, default=1)
    parser.add_argument("--replace-demo", action="store_true",
                        help="Desactiva únicamente los dos tonos originales; requiere pausa.")
    args = parser.parse_args()
    if args.station_id < 1:
        parser.error("--station-id debe ser positivo.")
    if not shutil.which("ffprobe") or not shutil.which("docker"):
        raise ValueError("Se necesitan ffprobe (FFmpeg) y Docker en el equipo.")
    # Validar todos los archivos antes de comenzar a escribir en la base de datos.
    files = [(path.resolve(), inspect_mp3(path.resolve())) for path in args.files]
    repo = Path(__file__).resolve().parent.parent
    for path, metadata in files:
        data = path.read_bytes()
        command = [
            "docker", "compose", "exec", "-T", "radio-service", "python", "-m",
            "radio_service.import_audio", "--station-id", str(args.station_id),
            "--title=" + metadata["title"], "--artist=" + metadata["artist"],
            "--duration-ms", str(metadata["duration_ms"]),
        ]
        if args.replace_demo:
            command.append("--replace-demo")
        result = subprocess.run(command, cwd=repo, input=data, capture_output=True, timeout=120)
        if result.returncode:
            raise ValueError(
                "Falló la importación. Comprueba Docker, la API y que la radio esté pausada."
            )
        saved = json.loads(result.stdout)
        if saved["sha256"] != hashlib.sha256(data).hexdigest():
            raise ValueError("Los bytes guardados no coinciden con el archivo de origen.")
        print(json.dumps({"file": path.name, **saved}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, InvalidOperation, OSError, subprocess.SubprocessError) as error:
        print(f"Error de importación: {error}", file=sys.stderr)
        sys.exit(1)
