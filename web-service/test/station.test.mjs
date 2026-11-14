import assert from "node:assert/strict";
import test from "node:test";
import { Station } from "../src/station.mjs";

function fakeRadio() {
  const sessions = new Set(["discord-session"]);
  let id = 0;
  const state = () => ({
    status: sessions.size ? "playing" : "paused",
    listeners: sessions.size,
  });
  return {
    sessions,
    live: async () => state(),
    join: async () => {
      const listener_id = `web-${++id}`;
      sessions.add(listener_id);
      return { listener_id, state: state() };
    },
    heartbeat: async () => state(),
    leave: async (key) => {
      sessions.delete(key);
      return state();
    },
    audio: async () => ({
      data: Buffer.from("RIFFaudio"),
      contentType: "audio/wav",
    }),
  };
}

test("la web usa la posición de la API y cerrar la web no pausa a Discord", async () => {
  const radio = fakeRadio();
  const station = new Station(radio);
  await station.initialize();
  const a = await station.join();
  const b = await station.join();
  assert.equal(b.state.listeners, 3);
  assert.equal((await station.heartbeat(a.listener_id)).listeners, 3);
  await station.close();
  assert.deepEqual([...radio.sessions], ["discord-session"]);
  assert.equal((await station.status()).status, "playing");
});

test("una web no puede renovar ni retirar la sesión de otro cliente", async () => {
  const radio = fakeRadio();
  const station = new Station(radio);
  await assert.rejects(station.heartbeat("discord-session"), {
    code: "listener_expired",
  });
  await station.leave("discord-session");
  assert.ok(radio.sessions.has("discord-session"));
});

test("las sesiones caducadas desaparecen del proxy y las salidas repetidas son inocuas", async () => {
  let now = 0;
  const station = new Station(fakeRadio(), { now: () => now, leaseMs: 1000 });
  const joined = await station.join();
  now = 1100;
  station.tick();
  await assert.rejects(station.heartbeat(joined.listener_id), {
    code: "listener_expired",
  });
  await station.leave(joined.listener_id);
  assert.equal(station.listeners.size, 0);
});
