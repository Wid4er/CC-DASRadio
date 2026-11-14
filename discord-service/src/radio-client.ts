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

export type LivePlayback = Playback & {
  playback_id: string;
  listeners: number;
};

function parseLive(value: unknown, stationId: number): LivePlayback {
  const playback = parsePlayback(value, stationId);
  if (
    !isRecord(value) ||
    typeof value.playback_id !== "string" ||
    !integer(value.listeners)
  )
    throw new RadioApiError("La API devolvió una emisión no válida.");
  return {
    ...playback,
    playback_id: value.playback_id,
    listeners: value.listeners,
  };
}

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

  private async request(
    path: string,
    method = "GET",
    body?: object,
    binary = false,
  ) {
    try {
      const response = await fetch(new URL(path, this.baseUrl), {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: "error",
      });
      if (!response.ok) {
        const error = new RadioApiError(
          `Consulta de radio fallida: HTTP ${response.status}.`,
        );
        if (response.status === 410) error.name = "ListenerExpired";
        throw error;
      }
      if (binary) return Buffer.from(await response.arrayBuffer());
      return (await response.json()) as unknown;
    } catch (error) {
      if (error instanceof RadioApiError) throw error;
      throw new RadioApiError("No se ha podido consultar la API de radio.");
    }
  }

  async live(stationId: number): Promise<LivePlayback> {
    return parseLive(
      await this.request(`/api/v1/stations/${stationId}/live`),
      stationId,
    );
  }

  async join(stationId: number) {
    const value = await this.request(
      `/api/v1/stations/${stationId}/listeners`,
      "POST",
      { kind: "discord" },
    );
    if (
      !isRecord(value) ||
      typeof value.listener_id !== "string" ||
      !/^[a-f0-9-]{36}$/.test(value.listener_id)
    )
      throw new RadioApiError("La API devolvió una conexión no válida.");
    return {
      listener_id: value.listener_id,
      state: parseLive(value.state, stationId),
    };
  }

  async heartbeat(stationId: number, listenerId: string) {
    return parseLive(
      await this.request(
        `/api/v1/stations/${stationId}/listeners/${listenerId}/heartbeat`,
        "POST",
      ),
      stationId,
    );
  }

  async leave(stationId: number, listenerId: string) {
    return parseLive(
      await this.request(
        `/api/v1/stations/${stationId}/listeners/${listenerId}/leave`,
        "POST",
      ),
      stationId,
    );
  }

  async audio(trackId: number): Promise<Buffer> {
    return (await this.request(
      `/api/v1/tracks/${trackId}/audio`,
      "GET",
      undefined,
      true,
    )) as Buffer;
  }
}
