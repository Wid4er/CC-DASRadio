ALTER TABLE station_playback
    ADD COLUMN intermission_remaining_ms integer NOT NULL DEFAULT 0
    CHECK (intermission_remaining_ms BETWEEN 0 AND 5000);
