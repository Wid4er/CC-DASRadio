export class RadioError extends Error {
  constructor(status = 503, code = "radio_unavailable") {
    super("No se pudo acceder a la emisora.");
    this.status = status;
    this.code = code;
  }
}

export class RadioClient {
  constructor({ url, token, stationId = 1, timeout = 5000 }) {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol) || !token?.trim()) {
      throw new Error("Configura RADIO_SERVICE_URL y SERVICE_TOKEN.");
    }
    if (!Number.isSafeInteger(stationId) || stationId < 1) {
      throw new Error("STATION_ID debe ser un entero positivo.");
    }
    this.url = url.replace(/\/$/, "");
    this.token = token;
    this.stationId = stationId;
    this.timeout = timeout;
  }

  async request(path, { method = "GET", body, binary = false } = {}) {
    try {
      const response = await fetch(`${this.url}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeout),
        redirect: "error",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new RadioError(
          response.status,
          error.error?.code ?? "radio_unavailable",
        );
      }
      if (binary) {
        return {
          data: Buffer.from(await response.arrayBuffer()),
          contentType:
            response.headers.get("content-type") ?? "application/octet-stream",
        };
      }
      return await response.json();
    } catch (error) {
      if (error instanceof RadioError) throw error;
      throw new RadioError();
    }
  }

  health() {
    return this.request("/health");
  }
  playback() {
    return this.request(`/api/v1/stations/${this.stationId}/playback`);
  }
  live() {
    return this.request(`/api/v1/stations/${this.stationId}/live`);
  }
  join() {
    return this.request(`/api/v1/stations/${this.stationId}/listeners`, {
      method: "POST",
      body: { kind: "web" },
    });
  }
  heartbeat(id) {
    return this.request(
      `/api/v1/stations/${this.stationId}/listeners/${id}/heartbeat`,
      {
        method: "POST",
      },
    );
  }
  leave(id) {
    return this.request(
      `/api/v1/stations/${this.stationId}/listeners/${id}/leave`,
      {
        method: "POST",
      },
    );
  }
  advance(reason) {
    return this.request(`/api/v1/stations/${this.stationId}/advance`, {
      method: "POST",
      body: { reason },
    });
  }
  progress(state, status, position) {
    return this.request(`/api/v1/stations/${this.stationId}/playback`, {
      method: "PATCH",
      body: {
        current_track_id: state.current_track_id,
        position_ms: position,
        status,
      },
    });
  }
  audio(trackId) {
    return this.request(`/api/v1/tracks/${trackId}/audio`, { binary: true });
  }
}
