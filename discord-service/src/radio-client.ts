export type PlaybackStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "error";
export type Playback = {
  station_id: number;
  current_track_id: number | null;
  position_ms: number;
  status: PlaybackStatus;
  track: {
    id: number;
    title: string;
    artist: string;
    duration_ms: number;
  } | null;
};

export class RadioApiError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parsePlayback(value: unknown, stationId: number): Playback {
  const states = ["idle", "loading", "playing", "paused", "error"];
  if (
    !isRecord(value) ||
    value.station_id !== stationId ||
    !integer(value.position_ms) ||
    !states.includes(String(value.status))
  ) {
    throw new RadioApiError("La API devolvió un estado no válido.");
  }
  if (value.track === null) {
    if (
      value.status !== "idle" ||
      value.current_track_id !== null ||
      value.position_ms !== 0
    ) {
      throw new RadioApiError("La API devolvió un estado incoherente.");
    }
  } else if (
    !isRecord(value.track) ||
    !integer(value.track.id) ||
    value.track.id <= 0 ||
    value.track.id !== value.current_track_id ||
    typeof value.track.title !== "string" ||
    typeof value.track.artist !== "string" ||
    !integer(value.track.duration_ms) ||
    value.track.duration_ms <= 0 ||
    value.position_ms > value.track.duration_ms ||
    value.status === "idle"
  ) {
    throw new RadioApiError("La API devolvió una canción no válida.");
  }
  return value as Playback;
}

export class RadioClient {
  private readonly baseUrl: URL;

  constructor(
    baseUrl: string,
    private readonly token: string,
    private readonly timeoutMs = 5000,
  ) {
    this.baseUrl = new URL(baseUrl);
    if (
      !["http:", "https:"].includes(this.baseUrl.protocol) ||
      this.baseUrl.username ||
      this.baseUrl.password
    ) {
      throw new Error(
        "RADIO_SERVICE_URL debe ser una URL HTTP sin credenciales.",
      );
    }
  }

  async playback(stationId: number): Promise<Playback> {
    try {
      const response = await fetch(
        new URL(`/api/v1/stations/${stationId}/playback`, this.baseUrl),
        {
          headers: { Authorization: `Bearer ${this.token}` },
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
      if (!response.ok)
        throw new RadioApiError(
          `Consulta de radio fallida: HTTP ${response.status}.`,
        );
      return parsePlayback(await response.json(), stationId);
    } catch (error) {
      if (error instanceof RadioApiError) throw error;
      throw new RadioApiError("No se ha podido consultar la API de radio.");
    }
  }
}
