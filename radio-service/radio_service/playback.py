"""Reloj único de la emisora y conexiones con caducidad, para web y Discord."""

import copy
import logging
import math
import threading
import time
import uuid

from .domain import RadioError

logger = logging.getLogger(__name__)


class Station:
    def __init__(self, repository, station_id, now=time.monotonic,
                 lease_seconds=45, checkpoint_seconds=5):
        self.repository = repository
        self.station_id = station_id
        self.now = now
        self.lease_seconds = lease_seconds
        self.checkpoint_seconds = checkpoint_seconds
        self.listeners = {}
        self.state = repository.playback(station_id)
        self.base_position = self.state["position_ms"]
        self.started_at = now()
        self.last_saved = now()
        self.retry_at = 0
        self.playing = False
        self.failed = False
        self.playback_id = str(uuid.uuid4())
        self.intermission_ms = self.state.get("intermission_remaining_ms", 0)
        self.intermission_until = None
        # Tras reiniciar no se recuperan conexiones obsoletas.
        if self.state["current_track_id"] and self.state["status"] != "paused":
            self.save("paused")

    def position(self):
        elapsed = int((self.now() - self.started_at) * 1000) if self.playing else 0
        duration = self.state["track"]["duration_ms"] if self.state["track"] else 0
        return min(duration, self.base_position + elapsed)

    def snapshot(self):
        result = copy.deepcopy(self.state)
        result.update(
            playback_id=self.playback_id, position_ms=self.position(),
            status=("error" if self.failed else "loading" if self.intermission_until is not None
                    else "playing" if self.playing else self.state["status"]),
            intermission_remaining_ms=self.intermission_remaining(),
            listeners=len(self.listeners),
            web_listeners=sum(kind == "web" for _, kind in self.listeners.values()),
            discord_connections=sum(kind == "discord" for _, kind in self.listeners.values()),
            checkpoint_ms=int(self.checkpoint_seconds * 1000),
        )
        return result

    def intermission_remaining(self):
        if self.intermission_until is None:
            return self.intermission_ms
        return max(0, min(self.intermission_ms,
                          math.ceil((self.intermission_until - self.now()) * 1000)))

    def save(self, status):
        position = self.position()
        saved = self.repository.progress(
            self.station_id, self.state["current_track_id"], position, status,
            intermission_remaining_ms=self.intermission_remaining(),
        )
        self.state.update(saved)
        # El checkpoint es una muestra: no reinicia el reloj de una emisión activa.
        # PostgreSQL puede tardar en responder mientras los clientes siguen sonando.
        if not self.playing or status != "playing":
            self.base_position = position
            self.started_at = self.now()
        self.last_saved = self.now()

    def select(self, reason):
        gap = 5000 if reason == "track_finished" else 0
        self.state = self.repository.advance(
            self.station_id, reason, intermission_remaining_ms=gap
        )
        self.base_position = 0
        self.playing = False
        self.playback_id = str(uuid.uuid4())
        self.intermission_ms = gap
        self.intermission_until = self.now() + gap / 1000 if gap else None
        self.repository.audio(self.state["current_track_id"])
        if gap:
            return
        self.save("playing")
        self.playing = True

    def step(self):
        now = self.now()
        self.listeners = {
            key: value for key, value in self.listeners.items()
            if now - value[0] < self.lease_seconds
        }
        if not self.listeners:
            if self.playing or self.intermission_until is not None:
                self.save("paused")
                self.playing = False
                self.intermission_ms = self.state["intermission_remaining_ms"]
                self.intermission_until = None
        elif self.intermission_ms or self.intermission_until is not None:
            if self.intermission_until is None:
                self.intermission_until = self.now() + self.intermission_ms / 1000
                self.save("loading")
            if self.intermission_remaining() == 0:
                self.repository.audio(self.state["current_track_id"])
                self.intermission_ms = 0
                self.intermission_until = None
                self.save("playing")
                self.playing = True
            elif now - self.last_saved >= self.checkpoint_seconds:
                self.save("loading")
        elif self.state["current_track_id"] is None:
            self.select("initial")
        elif self.position() >= self.state["track"]["duration_ms"]:
            self.select("track_finished")
        elif not self.playing:
            self.repository.audio(self.state["current_track_id"])
            # Recuperar un error guardado pasa primero por paused.
            if self.state["status"] == "error":
                self.save("paused")
            self.save("playing")
            self.playing = True
        elif now - self.last_saved >= self.checkpoint_seconds:
            self.save("playing")
        self.failed = False

    def join(self, kind):
        if len(self.listeners) >= 200:
            raise RadioError(
                503, "listener_limit", "La emisora ha alcanzado su límite de conexiones."
            )
        listener_id = str(uuid.uuid4())
        self.listeners[listener_id] = (self.now(), kind)
        try:
            self.step()
        except Exception:
            self.listeners.pop(listener_id, None)
            self.failed = True
            raise
        return {"listener_id": listener_id, "state": self.snapshot()}

    def heartbeat(self, listener_id):
        existing = self.listeners.get(listener_id)
        if existing is None or self.now() - existing[0] >= self.lease_seconds:
            self.listeners.pop(listener_id, None)
            raise RadioError(410, "listener_expired", "La conexión ha caducado.")
        self.listeners[listener_id] = (self.now(), existing[1])
        return self.snapshot()

    def leave(self, listener_id):
        self.listeners.pop(listener_id, None)
        self.step()
        return self.snapshot()

    def tick(self):
        if self.now() < self.retry_at:
            return
        try:
            self.step()
        except Exception as error:
            self.failed = True
            self.retry_at = self.now() + 5
            logger.error("No se pudo actualizar la emisora: %s", type(error).__name__)

    def close(self):
        self.listeners.clear()
        if self.state["current_track_id"] is not None:
            self.save("paused")
            self.intermission_ms = self.state["intermission_remaining_ms"]
            self.intermission_until = None
        self.playing = False


class PlaybackController:
    """Una instancia por proceso de API; la réplica exige coordinación adicional."""

    def __init__(self, repository):
        self.repository = repository
        self.lock = threading.RLock()
        self.stations = {}

    def call(self, station_id, method, *args):
        with self.lock:
            if station_id not in self.stations:
                self.stations[station_id] = Station(self.repository, station_id)
            return getattr(self.stations[station_id], method)(*args)

    def external_change(self, station_id, operation):
        with self.lock:
            station = self.stations.get(station_id)
            if station and station.listeners:
                raise RadioError(409, "playback_owned", "La emisora tiene conexiones activas.")
            result = operation()
            self.stations.pop(station_id, None)
            return result

    def tick(self):
        with self.lock:
            for station in self.stations.values():
                station.tick()

    def close(self):
        with self.lock:
            for station in self.stations.values():
                station.close()
