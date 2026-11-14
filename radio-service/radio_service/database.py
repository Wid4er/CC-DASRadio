from contextlib import contextmanager
from pathlib import Path

import psycopg
from psycopg.rows import dict_row


class Database:
    def __init__(self, connection_string: str):
        self.connection_string = connection_string

    @contextmanager
    def connect(self):
        with psycopg.connect(
            self.connection_string, row_factory=dict_row, connect_timeout=5
        ) as connection:
            yield connection

    def migrate(self):
        # El bloqueo y todas las migraciones se confirman en la misma transacción.
        with self.connect() as connection:
            connection.execute("SELECT pg_advisory_xact_lock(72418012)")
            connection.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations "
                "(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
            )
            applied = {
                row["version"]
                for row in connection.execute("SELECT version FROM schema_migrations")
            }
            for migration in sorted((Path(__file__).parent / "migrations").glob("*.sql")):
                if migration.stem not in applied:
                    connection.execute(migration.read_text(encoding="utf-8"))
                    connection.execute(
                        "INSERT INTO schema_migrations (version) VALUES (%s)", (migration.stem,)
                    )
