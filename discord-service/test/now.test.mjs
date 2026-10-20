import assert from "node:assert/strict";
import test from "node:test";
import { readConfig } from "../dist/config.js";
import { formatNow, handleNow } from "../dist/now.js";

const playback = {
  station_id: 1,
  current_track_id: 1,
  position_ms: 65000,
  status: "paused",
  track: { id: 1, title: "Ejemplo", artist: "Artista", duration_ms: 120000 },
};

test("now distingue una canción pausada de reproducción efectiva", () => {
  assert.match(formatNow(playback), /Ejemplo — Artista/);
  assert.match(formatNow(playback), /En pausa/);
  assert.match(formatNow(playback), /65 s/);
  assert.match(formatNow({ ...playback, track: null }), /no tiene una canción/);
});

test("now consulta una vez y bloquea menciones del catálogo", async () => {
  const replies = [];
  let calls = 0;
  const interaction = {
    deferReply: async () => replies.push("deferred"),
    editReply: async (reply) => replies.push(reply),
  };
  await handleNow(
    interaction,
    {
      playback: async (id) => {
        assert.equal(id, 1);
        calls++;
        return playback;
      },
    },
    1,
  );
  assert.equal(calls, 1);
  assert.equal(replies[0], "deferred");
  assert.deepEqual(replies[1].allowedMentions, { parse: [] });
});

test("los errores de API no exponen credenciales al usuario", async () => {
  let reply;
  await handleNow(
    {
      deferReply: async () => {},
      editReply: async (value) => {
        reply = value;
      },
    },
    {
      playback: async () => {
        throw new Error("dato-interno-de-prueba");
      },
    },
    1,
  );
  assert.match(reply.content, /No puedo consultar/);
  assert.doesNotMatch(reply.content, /dato-interno/);
});

test("la configuración exige token y una emisora válida", () => {
  assert.throws(() => readConfig({}), /DISCORD_TOKEN/);
  assert.throws(
    () =>
      readConfig({
        DISCORD_TOKEN: "test",
        SERVICE_TOKEN: "test",
        STATION_ID: "0",
      }),
    /STATION_ID/,
  );
});
