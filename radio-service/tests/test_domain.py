import pytest

from radio_service.domain import RadioError, choose_track, validate_progress


def test_empty_catalog_is_an_explicit_conflict():
    with pytest.raises(RadioError) as caught:
        choose_track([])
    assert (caught.value.status, caught.value.code) == (409, "empty_catalog")


def test_single_track_can_repeat():
    assert choose_track([42]) == 42
    assert choose_track([42]) == 42


@pytest.mark.parametrize("state", ["loading", "playing", "paused"])
def test_pause_preserves_a_valid_point(state):
    validate_progress(state, "paused", 65000, 100000)


def test_progress_outside_track_is_rejected():
    with pytest.raises(RadioError) as caught:
        validate_progress("playing", "paused", 100001, 100000)
    assert caught.value.status == 422


def test_loading_cannot_be_reported_as_idle():
    with pytest.raises(RadioError) as caught:
        validate_progress("loading", "idle", 0, 1000)
    assert caught.value.code == "state_conflict"


def test_paused_track_can_resume():
    validate_progress("paused", "playing", 65000, 100000)
