"""Arranque local con la biblioteca estándar; los servicios se ejecutan en Docker."""

import argparse
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
from pathlib import Path


def discord_help(repo_path):
    print("La web es una ayuda opcional para evaluar la práctica sin configurar Discord.")
    print(f"Tutorial opcional del bot: {repo_path / 'docs' / 'configurar-discord.md'}")
    print("Para continuar solo con la web: ./scripts/start.sh --web-only.")


def missing_values(environment, keys):
    missing = []
    for key in keys:
        value = str(environment.get(key) or "").strip()
        if not value or re.match(r"^(cambia-|TU_TOKEN$|ID_DE_|RELLENA_|<|\.\.\.$)", value):
            missing.append(key)
        elif key in {"DISCORD_CLIENT_ID", "DISCORD_GUILD_ID"} and not re.fullmatch(
            r"[1-9][0-9]*", value
        ):
            missing.append(key)
    return missing


def main():
    parser = argparse.ArgumentParser(description="Configura y arranca CC-DASRadio con Docker.")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--api-only", action="store_true", help="Arranca solo API y PostgreSQL.")
    modes.add_argument("--discord", action="store_true", help="Añade el bot Discord a la web.")
    modes.add_argument("--web-only", action="store_true", help="Arranca la web sin añadir Discord.")
    args = parser.parse_args()
    repo_path = Path(__file__).resolve().parent.parent
    env_path = repo_path / ".env"

    if not env_path.exists():
        template = (repo_path / ".env.example").read_text(encoding="utf-8-sig")
        template = template.replace("cambia-esta-contrasena-local", secrets.token_hex(32))
        template = template.replace("cambia-este-token-interno", secrets.token_hex(32))
        # O_EXCL conserva cualquier archivo creado por otro proceso; 0600 protege las claves.
        descriptor = os.open(env_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(template)
        print(f"Primera ejecución: se ha creado {env_path}")
        print("Las claves internas de PostgreSQL y de la API ya están generadas.")
        discord_help(repo_path)
        if args.discord:
            print("Completa DISCORD_TOKEN, DISCORD_CLIENT_ID y DISCORD_GUILD_ID "
                  "y repite el arranque.")
            print("No se ha iniciado ningún contenedor.")
            return 0
        print("Se iniciará el entorno local sin necesitar una cuenta Discord.")

    if shutil.which("docker") is None:
        print("Error: no se encuentra Docker. Consulta docs/desarrollo-local.md.", file=sys.stderr)
        return 1
    if subprocess.run(["docker", "compose", "version"], capture_output=True).returncode:
        print("Error: Docker Compose no está disponible.", file=sys.stderr)
        return 1

    compose = [
        "docker", "compose", "--project-directory", str(repo_path), "--env-file", str(env_path)
    ]
    # Compose interpreta .env y su precedencia; nunca se ejecuta su contenido como shell.
    inspect_discord = not (args.api_only or args.web_only)
    profile = ["--profile", "discord"] if inspect_discord else []
    config = subprocess.run(
        [*compose, *profile, "config", "--format", "json"], capture_output=True, text=True
    )
    if config.returncode:
        print("Error: configuración Compose inválida. Revisa .env y compose.yaml.", file=sys.stderr)
        return 1
    services = json.loads(config.stdout)["services"]
    missing = missing_values(
        services["radio-service"]["environment"], ("POSTGRES_PASSWORD", "SERVICE_TOKEN")
    )
    bot_keys = ("DISCORD_TOKEN", "DISCORD_CLIENT_ID", "DISCORD_GUILD_ID")
    bot_missing = missing_values(
        services["discord-service"]["environment"], bot_keys
    ) if inspect_discord else list(bot_keys)
    enable_discord = inspect_discord and not bot_missing
    if args.discord:
        missing.extend(bot_missing)
    if missing:
        print(f"Completa o corrige estos campos en {env_path}:", file=sys.stderr)
        for key in missing:
            print(f"- {key}", file=sys.stderr)
        print("No se ha iniciado ningún contenedor. Tu archivo se conserva.", file=sys.stderr)
        if any(key.startswith("DISCORD_") for key in missing):
            discord_help(repo_path)
        return 1

    if enable_discord:
        print("Configuración de Discord completa: se incluirá el bot en el arranque.")
    elif inspect_discord:
        print("Discord sin configurar o incompleto: se iniciarán web, API y PostgreSQL.")
        print("Campos pendientes de Discord: " + ", ".join(bot_missing))

    if subprocess.run(["docker", "info"], capture_output=True).returncode:
        print("Error: no se puede acceder al motor Docker.", file=sys.stderr)
        print("En Linux comprueba el servicio: sudo systemctl start docker", file=sys.stderr)
        print("Comprueba también los permisos de tu usuario con docker info.", file=sys.stderr)
        return 1

    if args.api_only:
        command = [*compose, "up", "-d", "--build", "--wait", "radio-service"]
    elif enable_discord:
        command = [*compose, "--profile", "discord", "up", "-d", "--build", "--wait",
                   "web-service", "discord-service"]
    else:
        command = [*compose, "up", "-d", "--build", "--wait", "web-service"]
    result = subprocess.run(command)
    if result.returncode:
        print("Error: no se pudo completar el arranque. Revisa docker compose ps y logs.",
              file=sys.stderr)
        if enable_discord:
            discord_help(repo_path)
        return result.returncode
    port = next(
        (item["published"] for item in services["radio-service"].get("ports", [])
         if item.get("target") == 8000),
        "8000",
    )
    print(f"Entorno arrancado. API: http://127.0.0.1:{port}/docs")
    if not args.api_only:
        web_port = next(
            (item["published"] for item in services["web-service"].get("ports", [])
             if item.get("target") == 8080),
            "8080",
        )
        print(f"Escucha compartida: http://127.0.0.1:{web_port}")
        print(f"Configurar Discord (opcional): http://127.0.0.1:{web_port}/ayuda/discord")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError) as error:
        # No incluir el contenido de la configuración ni las credenciales en errores.
        print(f"Error de arranque ({type(error).__name__}). Revisa la configuración local.",
              file=sys.stderr)
        sys.exit(1)
