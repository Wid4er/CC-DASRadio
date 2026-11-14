import copy
from concurrent.futures import ThreadPoolExecutor

import pytest

from radio_service.domain import RadioError
from radio_service.playback import PlaybackController, Station


class Repository:
    def __init__(self):
        self.state = {"station_id": 1, "current_track_id": None, "position_ms": 0,
                      "status": "idle", "track": None}
        self.selections = 0
        self.fail_save = False

    def playback(self, _station_id):
        return copy.deepcopy(self.state)

    def advance(self, _station_id, _reason, intermission_remaining_ms=0):
        self.selections += 1
        self.state.update(current_track_id=1, position_ms=0, status="loading",
                          intermission_remaining_ms=intermission_remaining_ms,
                          track={"id": 1, "title": "Prueba", "artist": "Autor",
                                 "duration_ms": 100000})
        return self.playback(1)

    def progress(self, _station_id, _track_id, position, status, intermission_remaining_ms=0):
        if self.fail_save:
            raise OSError("dato privado")
        self.state.update(position_ms=position, status=status,
                          intermission_remaining_ms=intermission_remaining_ms)
        return {"position_ms": position, "status": status,
                "intermission_remaining_ms": intermission_remaining_ms}

    def audio(self, _track_id):
        return b"RIFFtestWAVEaudio", "audio/wav"


def test_web_and_discord_share_provider_clock_and_only_last_leave_pauses():
    clock = [0.0]
    repo = Repository()
    station = Station(repo, 1, now=lambda: clock[0])
    web = station.join("web")
    clock[0] = 2.5
    discord = station.join("discord")
    state = discord["state"]
    assert state["position_ms"] == 2500
    assert state["playback_id"] == web["state"]["playback_id"]
    assert state["web_listeners"] == state["discord_connections"] == 1
    assert repo.selections == 1
    assert station.leave(web["listener_id"])["status"] == "playing"
    clock[0] = 4.0
    paused = station.leave(discord["listener_id"])
    assert paused["status"] == "paused" and paused["position_ms"] == 4000
    clock[0] = 10.0
    resumed = station.join("discord")["state"]
    assert resumed["position_ms"] == 4000 and repo.selections == 1


def test_live_position_advances_between_persistent_checkpoints():
    clock = [0.0]
    repo = Repository()
    station = Station(repo, 1, now=lambda: clock[0])
    station.join("web")
    clock[0] = 2.0
    station.tick()
    assert repo.state["position_ms"] == 0
    assert station.snapshot()["position_ms"] == 2000
    clock[0] = 5.0
    station.tick()
    assert repo.state["position_ms"] == 5000


def test_slow_checkpoints_do_not_rewind_the_live_clock():
    clock = [0.0]
    repo = Repository()
    station = Station(repo, 1, now=lambda: clock[0], lease_seconds=300)
    station.join("web")
    save = repo.progress

    def slow_save(*args, **kwargs):
        result = save(*args, **kwargs)
        # El audio sigue sonando mientras PostgreSQL confirma el checkpoint.
        clock[0] += 0.8
        return result

    repo.progress = slow_save
    for second in range(5, 61, 5):
        clock[0] = float(second)
        station.tick()
        assert abs(station.snapshot()["position_ms"] - int(clock[0] * 1000)) <= 1
    paused = station.leave(next(iter(station.listeners)))
    assert paused["status"] == "paused"
    assert paused["position_ms"] >= 60000


def test_finish_advances_once_and_repeated_song_has_new_playback_id():
    clock = [0.0]
    repo = Repository()
    station = Station(repo, 1, now=lambda: clock[0], lease_seconds=200)
    initial = station.join("discord")["state"]
    clock[0] = 100.0
    station.tick()
    station.tick()
    assert repo.selections == 2
    assert station.snapshot()["current_track_id"] == initial["current_track_id"]
    assert station.snapshot()["playback_id"] != initial["playback_id"]
    assert station.snapshot()["position_ms"] == 0
    assert station.snapshot()["status"] == "loading"
    assert station.snapshot()["intermission_remaining_ms"] == 5000
    clock[0] = 104.9
    station.tick()
    assert station.snapshot()["status"] == "loading"
    clock[0] = 105.0
    station.tick()
    assert station.snapshot()["status"] == "playing"
    assert station.snapshot()["position_ms"] == 0
    assert repo.selections == 2


def test_intermission_is_shared_and_pause_restart_preserves_remaining_silence():
    clock = [0.0]
    repo = Repository()
    station = Station(repo, 1, now=lambda: clock[0], lease_seconds=300)
    web = station.join("web")
    clock[0] = 100.0
    station.tick()
    clock[0] = 102.0
    discord = station.join("discord")
    assert discord["state"]["status"] == "loading"
    assert discord["state"]["intermission_remaining_ms"] == 3000
    station.leave(web["listener_id"])
    paused = station.leave(discord["listener_id"])
    assert paused["status"] == "paused"
    assert paused["intermission_remaining_ms"] == 3000
    clock[0] = 200.0
    restarted = Station(repo, 1, now=lambda: clock[0], lease_seconds=300)
    resumed = restarted.join("web")["state"]
    assert resumed["status"] == "loading"
    assert resumed["intermission_remaining_ms"] == 3000
    clock[0] = 203.0
    restarted.tick()
    assert restarted.snapshot()["status"] == "playing"
    assert restarted.snapshot()["intermission_remaining_ms"] == 0
    assert repo.selections == 2


def test_expired_connections_pause_and_restart_recovers_only_checkpoint():
    clock = [0.0]
    repo = Repository()
    station = Station(repo, 1, now=lambda: clock[0], lease_seconds=2)
    joined = station.join("web")
    clock[0] = 2.1
    station.tick()
    assert station.snapshot()["listeners"] == 0
    assert station.snapshot()["status"] == "paused"
    with pytest.raises(RadioError, match="caducado"):
        station.heartbeat(joined["listener_id"])
    repo.state["status"] = "playing"
    restarted = Station(repo, 1, now=lambda: clock[0])
    assert restarted.snapshot()["listeners"] == 0
    assert restarted.snapshot()["status"] == "paused"
    assert restarted.snapshot()["position_ms"] == 2100


def test_failed_pause_is_retried_without_selecting_another_track():
    clock = [0.0]
    repo = Repository()
    station = Station(repo, 1, now=lambda: clock[0], lease_seconds=2)
    station.join("discord")
    repo.fail_save = True
    clock[0] = 3.0
    station.tick()
    assert station.snapshot()["status"] == "error"
    repo.fail_save = False
    clock[0] = 8.0
    station.tick()
    assert station.snapshot()["status"] == "paused"
    assert repo.selections == 1


def test_concurrent_clients_cannot_create_two_initial_selections():
    repo = Repository()
    controller = PlaybackController(repo)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: controller.call(1, "join", "discord"), range(8)))
    assert repo.selections == 1
    assert len({r["state"]["playback_id"] for r in results}) == 1
    assert controller.call(1, "snapshot")["listeners"] == 8
    with pytest.raises(RadioError, match="conexiones activas"):
        controller.external_change(1, lambda: None)
    controller.close()


def test_join_failure_does_not_leave_a_phantom_listener():
    repo = Repository()
    repo.fail_save = True
    station = Station(repo, 1)
    with pytest.raises(OSError):
        station.join("web")
    assert not station.listeners
