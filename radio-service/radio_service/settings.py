import os
from dataclasses import dataclass, field

from psycopg.conninfo import make_conninfo


@dataclass(frozen=True)
class Settings:
    database_url: str = field(repr=False)
    service_token: str = field(repr=False)
    seed_demo: bool = False

    @classmethod
    def from_env(cls):
        token = os.environ.get("SERVICE_TOKEN", "")
        if not token.strip():
            raise ValueError("Configura SERVICE_TOKEN en el entorno.")
        database_url = os.environ.get("DATABASE_URL") or make_conninfo(
            host=os.environ.get("POSTGRES_HOST", "postgres"),
            port=os.environ.get("POSTGRES_PORT", "5432"),
            dbname=os.environ.get("POSTGRES_DB", "dasradio"),
            user=os.environ.get("POSTGRES_USER", "dasradio"),
            password=os.environ.get("POSTGRES_PASSWORD", ""),
            connect_timeout="5",
        )
        return cls(
            database_url=database_url,
            service_token=token,
            seed_demo=os.environ.get("SEED_DEMO", "false").lower() in {"true", "1"},
        )
