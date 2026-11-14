import { RadioError } from "./radio-client.mjs";

// El reloj y el avance pertenecen a la API. La web solo posee sus sesiones.
export class Station {
  constructor(radio, { now = () => performance.now(), leaseMs = 45000 } = {}) {
    this.radio = radio;
    this.now = now;
    this.leaseMs = leaseMs;
    this.listeners = new Map();
    this.audioCache = new Map();
  }

  async initialize() {
    await this.radio.live();
  }

  status() {
    return this.radio.live();
  }

  async join() {
    const result = await this.radio.join();
    this.listeners.set(result.listener_id, this.now());
    return result;
  }

  async heartbeat(id) {
    if (!this.listeners.has(id)) throw new RadioError(410, "listener_expired");
    try {
      const state = await this.radio.heartbeat(id);
      this.listeners.set(id, this.now());
      return state;
    } catch (error) {
      if (error.code === "listener_expired") this.listeners.delete(id);
      throw error;
    }
  }

  async leave(id) {
    if (!this.listeners.delete(id)) return this.status();
    return this.radio.leave(id);
  }

  async audio(trackId) {
    if (!this.audioCache.has(trackId)) {
      const request = this.radio.audio(trackId).catch((error) => {
        this.audioCache.delete(trackId);
        throw error;
      });
      this.audioCache.set(trackId, request);
      if (this.audioCache.size > 2)
        this.audioCache.delete(this.audioCache.keys().next().value);
    }
    return this.audioCache.get(trackId);
  }

  tick() {
    for (const [id, seen] of this.listeners) {
      if (this.now() - seen >= this.leaseMs) this.listeners.delete(id);
    }
  }

  async close() {
    const ids = [...this.listeners.keys()];
    this.listeners.clear();
    await Promise.allSettled(ids.map((id) => this.radio.leave(id)));
    this.audioCache.clear();
  }
}
