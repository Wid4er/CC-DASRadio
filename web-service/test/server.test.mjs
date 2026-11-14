import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { RadioClient } from "../src/radio-client.mjs";
import { audioRange, createWebService } from "../src/server.mjs";

async function fakeApi() {
  let state = {
    station_id: 1,
    current_track_id: null,
    position_ms: 0,
    status: "idle",
    track: null,
  };
  const listeners = new Set();
  const playbackId = randomUUID();
  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== "Bearer internal-test-token") {
      response.writeHead(401, { "Content-Type": "application/json" });
      return response.end(
        JSON.stringify({
          error: { code: "unauthorized", message: "internal-test-token" },
        }),
      );
    }
    if (request.url === "/api/v1/tracks/1/audio") {
      response.writeHead(200, { "Content-Type": "audio/wav" });
      return response.end("RIFFtestWAVEaudio");
    }
    request.resume();
    let listener_id;
    if (request.url.endsWith("/listeners")) {
      listener_id = randomUUID();
      listeners.add(listener_id);
      state = {
        ...state,
        current_track_id: 1,
        status: "playing",
        track: {
          id: 1,
          title: "Prueba HTTP",
          artist: "Test",
          duration_ms: 100000,
        },
      };
    }
    const leaving = /\/listeners\/([^/]+)\/leave$/.exec(request.url);
    if (leaving) listeners.delete(leaving[1]);
    state = {
      ...state,
      status: listeners.size ? "playing" : state.track ? "paused" : "idle",
      listeners: listeners.size,
      playback_id: playbackId,
    };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify(
        request.url === "/health"
          ? { status: "ok" }
          : listener_id
            ? { listener_id, state }
            : state,
      ),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("HTTP real: la web media con la API, dos sesiones comparten estado y el audio permite seek", async (t) => {
  const api = await fakeApi();
  const app = await createWebService(
    new RadioClient({ url: api.url, token: "internal-test-token" }),
  );
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  t.after(async () => {
    try {
      await app.close();
    } finally {
      await api.close();
    }
  });
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.match(
    page.headers.get("content-security-policy"),
    /script-src 'self'/,
  );
  assert.doesNotMatch(await page.text(), /internal-test-token/);
  const guide = await fetch(`${url}/ayuda/discord`);
  assert.equal(guide.status, 200);
  const tutorial = await guide.text();
  assert.match(tutorial, /https:\/\/discord.com\/developers\/applications/);
  assert.match(tutorial, /<title>Configurar Discord · DAS Radio<\/title>/);
  assert.match(tutorial, /data-page="discord" aria-labelledby/);
  assert.match(tutorial, /data-page="radio" hidden/);
  assert.match(tutorial, /id="connect"/);
  assert.doesNotMatch(tutorial, /internal-test-token/);
  const music = await fetch(`${url}/ayuda/musica`);
  assert.equal(music.status, 200);
  const instructions = await music.text();
  assert.match(instructions, /<title>Cargar música · DAS Radio<\/title>/);
  assert.match(instructions, /data-page="music" aria-labelledby/);
  assert.match(instructions, /data-page="discord" hidden/);
  assert.match(instructions, /scripts\/import-mp3.py/);
  assert.match(instructions, /--replace-demo/);
  assert.match(instructions, /32 MiB/);
  assert.doesNotMatch(instructions, /internal-test-token|<!-- MUSIC_GUIDE -->/);
  const navigation = await fetch(`${url}/navigation.js`);
  assert.equal(navigation.status, 200);
  assert.match(navigation.headers.get("content-type"), /text\/javascript/);
  assert.equal((await fetch(`${url}/health`)).status, 200);
  const a = await (
    await fetch(`${url}/api/listeners`, { method: "POST" })
  ).json();
  const b = await (
    await fetch(`${url}/api/listeners`, { method: "POST" })
  ).json();
  assert.equal(b.state.listeners, 2);
  assert.equal(a.state.playback_id, b.state.playback_id);
  const audio = await fetch(`${url}/api/audio/1?listener=${a.listener_id}`, {
    headers: { Range: "bytes=0-3" },
  });
  assert.equal(audio.status, 206);
  assert.equal(audio.headers.get("content-range"), "bytes 0-3/17");
  assert.equal(await audio.text(), "RIFF");
  assert.equal((await fetch(`${url}/api/audio/1`)).status, 410);
  const leftA = await (
    await fetch(`${url}/api/listeners/${a.listener_id}/leave`, {
      method: "POST",
    })
  ).json();
  assert.equal(leftA.status, "playing");
  const leftB = await (
    await fetch(`${url}/api/listeners/${b.listener_id}/leave`, {
      method: "POST",
    })
  ).json();
  assert.equal(leftB.status, "paused");
  assert.equal(leftB.listeners, 0);
  const foreign = await fetch(`${url}/api/listeners`, {
    method: "POST",
    headers: { Origin: "https://other.example" },
  });
  assert.equal(foreign.status, 403);
});

test("los fallos de autenticación de la API no exponen su credencial ni su mensaje interno", async (t) => {
  const api = await fakeApi();
  t.after(() => api.close());
  const radio = new RadioClient({ url: api.url, token: "incorrect-token" });
  await assert.rejects(radio.playback(), (error) => {
    assert.equal(error.code, "unauthorized");
    assert.doesNotMatch(error.message, /internal-test-token|incorrect-token/);
    return true;
  });
});

test("los rangos binarios respetan límites y rechazan entradas inválidas", () => {
  assert.deepEqual(audioRange(undefined, 16), [0, 15]);
  assert.deepEqual(audioRange("bytes=4-", 16), [4, 15]);
  assert.deepEqual(audioRange("bytes=-4", 16), [12, 15]);
  assert.deepEqual(audioRange("bytes=4-100", 16), [4, 15]);
  for (const invalid of [
    "bytes=30-40",
    "bytes=4-3",
    "bytes=-0",
    "bytes=",
    "bytes=0-2,4-6",
  ]) {
    assert.equal(audioRange(invalid, 16), null);
  }
});
