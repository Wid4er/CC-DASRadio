import type { LivePlayback, RadioClient } from "./radio-client.js";

export class VoiceUserError extends Error {}

export interface VoiceLink {
  channelId: string;
  destroy(): void;
}

export interface AudioOutput {
  play(data: Buffer, positionMs: number): Promise<void>;
  stop(): void;
  position(): number | null;
}

type Session = { link: VoiceLink; listenerId: string };

// Un reproductor común para todas las conexiones; el proveedor gobierna el reloj.
export class SharedRadio {
  private readonly sessions = new Map<string, Session>();
  private readonly audio = new Map<number, Buffer>();
  private generation: string | undefined;
  private tail: Promise<unknown> = Promise.resolve();
  private lastHeartbeat = 0;
  private lastPoll = 0;
  private lastSuccess = 0;
  private lastRestart = 0;
  private retryAt = 0;
  private ticking = false;
  private closing = false;

  constructor(
    private readonly api: Pick<
      RadioClient,
      "live" | "join" | "heartbeat" | "leave" | "audio"
    >,
    private readonly stationId: number,
    private readonly output: AudioOutput,
    private readonly now = () => performance.now(),
  ) {}

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => {});
    return result;
  }

  start(guildId: string, channelId: string, connect: () => Promise<VoiceLink>) {
    return this.serial(async () => {
      if (this.closing)
        throw new VoiceUserError(
          "El bot se está reiniciando. Vuelve a intentarlo.",
        );
      const existing = this.sessions.get(guildId);
      if (existing) {
        if (existing.link.channelId !== channelId)
          throw new VoiceUserError(
            "Ya estoy en otro canal de este servidor. Usa /radio stop antes de cambiar.",
          );
        return "La radio ya está conectada a tu canal.";
      }
      const link = await connect();
      let listenerId: string | undefined;
      try {
        const joined = await this.api.join(this.stationId);
        listenerId = joined.listener_id;
        this.sessions.set(guildId, { link, listenerId });
        await this.sync(joined.state);
        this.lastSuccess = this.now();
        return "Conectado a la emisora compartida. Usa /radio stop para salir de este servidor.";
      } catch (error) {
        this.sessions.delete(guildId);
        link.destroy();
        if (listenerId)
          await this.api.leave(this.stationId, listenerId).catch(() => {});
        if (!this.sessions.size) this.stopAudio();
        throw error;
      }
    });
  }

  stop(guildId: string) {
    return this.serial(async () => {
      const session = this.sessions.get(guildId);
      if (!session) return "La radio no está conectada en este servidor.";
      this.sessions.delete(guildId);
      session.link.destroy();
      if (!this.sessions.size) this.stopAudio();
      // Si la API está caída, la concesión caduca sin crear una conexión fantasma permanente.
      await this.api.leave(this.stationId, session.listenerId).catch(() => {
        console.error(
          "No se pudo confirmar la salida; la conexión caducará en el proveedor.",
        );
      });
      return "Desconectado de este servidor. La emisora continúa si quedan otros oyentes.";
    });
  }

  private stopAudio() {
    this.generation = undefined;
    this.output.stop();
  }

  private async sync(
    state: LivePlayback,
    afterDownload = false,
  ): Promise<void> {
    if (state.status === "loading" && state.track) {
      this.stopAudio();
      if (!this.audio.has(state.track.id)) {
        this.audio.set(state.track.id, await this.api.audio(state.track.id));
        if (this.audio.size > 2)
          this.audio.delete(this.audio.keys().next().value as number);
      }
      return;
    }
    if (state.status !== "playing" || !state.track) {
      this.stopAudio();
      return;
    }
    if (state.position_ms >= state.track.duration_ms - 100) {
      this.stopAudio();
      return;
    }
    const position = this.output.position();
    const drift = position === null ? Infinity : state.position_ms - position;
    if (
      this.generation === state.playback_id &&
      position !== null &&
      (drift < 5000 || this.now() - this.lastRestart < 5000)
    )
      return;
    if (!this.audio.has(state.track.id)) {
      const data = await this.api.audio(state.track.id);
      this.audio.set(state.track.id, data);
      if (this.audio.size > 2)
        this.audio.delete(this.audio.keys().next().value as number);
      // Obtener el tiempo actual después de descargar; no empezar con un punto obsoleto.
      return this.sync(await this.api.live(this.stationId), true);
    }
    if (!afterDownload) {
      const latest = await this.api.live(this.stationId);
      if (latest.playback_id !== state.playback_id)
        return this.sync(latest, true);
      state = latest;
    }
    if (state.status !== "playing" || !state.track) return this.stopAudio();
    await this.output.play(
      this.audio.get(state.track.id) as Buffer,
      state.position_ms,
    );
    this.generation = state.playback_id;
    this.lastRestart = this.now();
  }

  tick() {
    if (
      this.ticking ||
      this.now() < this.retryAt ||
      !this.sessions.size ||
      this.now() - this.lastPoll < 750
    )
      return Promise.resolve();
    this.ticking = true;
    return this.serial(async () => {
      if (!this.sessions.size) return;
      if (this.now() - this.lastHeartbeat >= 5000) {
        for (const session of this.sessions.values()) {
          try {
            await this.api.heartbeat(this.stationId, session.listenerId);
          } catch (error) {
            if (!(error instanceof Error) || error.name !== "ListenerExpired")
              throw error;
            // Las conexiones de voz siguen activas, pero el proveedor se ha reiniciado.
            session.listenerId = (
              await this.api.join(this.stationId)
            ).listener_id;
          }
        }
        this.lastHeartbeat = this.now();
      }
      await this.sync(await this.api.live(this.stationId));
      this.lastPoll = this.now();
      this.lastSuccess = this.now();
    })
      .catch(() => {
        this.retryAt = this.now() + 3000;
        if (this.now() - this.lastSuccess >= 10000) this.stopAudio();
        console.error(
          "No se pudo actualizar el audio de Discord; se volverá a consultar al proveedor.",
        );
      })
      .finally(() => {
        this.ticking = false;
      });
  }

  async close() {
    this.closing = true;
    await this.serial(async () => {
      const sessions = [...this.sessions.values()];
      this.sessions.clear();
      this.stopAudio();
      for (const session of sessions) {
        session.link.destroy();
        await this.api
          .leave(this.stationId, session.listenerId)
          .catch(() => {});
      }
      this.audio.clear();
    });
  }
}
