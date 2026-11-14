import assert from "node:assert/strict";
import test from "node:test";
import { radioCommand } from "../dist/commands.js";
import { SharedRadio } from "../dist/shared-radio.js";

function fixture() {
  let time = 0;
  let ids = 0;
  let position = null;
  const listeners = new Set(["browser"]);
  const destroyed = [];
  const plays = [];
  const state = {
    station_id: 1,
    current_track_id: 1,
    position_ms: 12345,
    status: "playing",
    playback_id: "first",
    listeners: 1,
    track: { id: 1, title: "Prueba", artist: "Autor", duration_ms: 100000 },
  };
  const api = {
    live: async () => structuredClone(state),
    join: async () => {
      const listener_id = `discord-${++ids}`;
      listeners.add(listener_id);
      return { listener_id, state: structuredClone(state) };
    },
    heartbeat: async () => structuredClone(state),
    leave: async (_station, id) => {
      listeners.delete(id);
      return structuredClone(state);
    },
    audio: async () => Buffer.from("ID3test"),
  };
  const output = {
    play: async (_data, offset) => {
      position = offset;
      plays.push(offset);
    },
    stop: () => {
      position = null;
    },
    position: () => position,
  };
  const radio = new SharedRadio(api, 1, output, () => time);
  const connect =
    (guild, channel = "channel") =>
    async () => ({ channelId: channel, destroy: () => destroyed.push(guild) });
  return {
    radio,
    api,
    output,
    state,
    listeners,
    plays,
    destroyed,
    connect,
    setTime: (n) => {
      time = n;
    },
  };
}

test("start y stop se registran junto con now", () => {
  assert.deepEqual(
    radioCommand.toJSON().options.map((x) => x.name),
    ["start", "stop", "now"],
  );
});

test("dos servidores comparten un solo recurso y el segundo entra en el punto actual", async () => {
  const f = fixture();
  await f.radio.start("a", "channel", f.connect("a"));
  await f.radio.start("b", "channel", f.connect("b"));
  assert.deepEqual(f.plays, [12345]);
  assert.equal(f.listeners.size, 3);
  await f.radio.stop("a");
  assert.equal(f.output.position(), 12345);
  assert.equal(f.listeners.size, 2);
  await f.radio.stop("b");
  assert.equal(f.output.position(), null);
  assert.deepEqual([...f.listeners], ["browser"]);
});

test("start repetido no duplica una conexión y cambiar de canal exige stop", async () => {
  const f = fixture();
  await Promise.all([
    f.radio.start("a", "channel", f.connect("a")),
    f.radio.start("a", "channel", f.connect("a")),
  ]);
  assert.equal(f.listeners.size, 2);
  assert.equal(f.plays.length, 1);
  await assert.rejects(
    f.radio.start("a", "other", f.connect("a", "other")),
    /stop/,
  );
  await f.radio.close();
  assert.deepEqual(f.destroyed, ["a"]);
});

test("avanzar a otra reproducción de la misma canción reemplaza el recurso una sola vez", async () => {
  const f = fixture();
  await f.radio.start("a", "channel", f.connect("a"));
  f.state.playback_id = "second";
  f.state.position_ms = 500;
  f.setTime(1000);
  await Promise.all([f.radio.tick(), f.radio.tick()]);
  assert.deepEqual(f.plays, [12345, 500]);
  await f.radio.close();
});

test("una conexión fallida limpia la concesión y conserva al oyente web", async () => {
  const f = fixture();
  f.output.play = async () => {
    throw new Error("private");
  };
  await assert.rejects(f.radio.start("a", "channel", f.connect("a")));
  assert.deepEqual(f.destroyed, ["a"]);
  assert.deepEqual([...f.listeners], ["browser"]);
  await f.radio.close();
});

test("un reinicio del proveedor renueva las sesiones reales de voz", async () => {
  const f = fixture();
  await f.radio.start("a", "channel", f.connect("a"));
  f.api.heartbeat = async () => {
    const error = new Error("expired");
    error.name = "ListenerExpired";
    throw error;
  };
  f.setTime(6000);
  await f.radio.tick();
  assert.ok(f.listeners.has("discord-2"));
  await f.radio.close();
});

test("el bot prepara el siguiente audio en silencio y lo arranca cuando lo indica la API", async () => {
  const f = fixture();
  const downloads = [];
  f.api.audio = async (id) => {
    downloads.push(id);
    return Buffer.from("ID3test");
  };
  await f.radio.start("a", "channel", f.connect("a"));
  f.state.status = "loading";
  f.state.playback_id = "second";
  f.state.track.id = 2;
  f.state.position_ms = 0;
  f.setTime(6000);
  await f.radio.tick();
  assert.equal(f.output.position(), null);
  assert.deepEqual(downloads, [1, 2]);
  assert.deepEqual(f.plays, [12345]);
  f.state.status = "playing";
  f.setTime(11000);
  await f.radio.tick();
  assert.deepEqual(f.plays, [12345, 0]);
  assert.deepEqual(downloads, [1, 2]);
  await f.radio.close();
});

test("el bot tolera cuatro segundos y recupera seis segundos de retraso hacia delante", async () => {
  const f = fixture();
  await f.radio.start("a", "channel", f.connect("a"));
  f.state.position_ms = 16345;
  f.setTime(6000);
  await f.radio.tick();
  assert.deepEqual(f.plays, [12345]);
  f.state.position_ms = 18345;
  f.setTime(12000);
  await f.radio.tick();
  assert.deepEqual(f.plays, [12345, 18345]);
  await f.radio.close();
});
