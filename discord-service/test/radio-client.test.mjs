import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { RadioApiError, RadioClient } from "../dist/radio-client.js";

async function api(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("el cliente envía el token y consulta sin modificar la programación", async (t) => {
  const url = await api(t, (request, response) => {
    assert.equal(request.method, "GET");
    assert.equal(request.url, "/api/v1/stations/1/playback");
    assert.equal(request.headers.authorization, "Bearer test-only-token");
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        station_id: 1,
        current_track_id: null,
        position_ms: 0,
        status: "idle",
        track: null,
      }),
    );
  });
  const playback = await new RadioClient(url, "test-only-token").playback(1);
  assert.equal(playback.status, "idle");
});

test("el cliente distingue fallos HTTP y respuestas inválidas", async (t) => {
  const unavailable = await api(t, (_request, response) => {
    response.writeHead(503).end();
  });
  await assert.rejects(
    new RadioClient(unavailable, "test").playback(1),
    /HTTP 503/,
  );
  const invalid = await api(t, (_request, response) => response.end("{}"));
  await assert.rejects(
    new RadioClient(invalid, "test").playback(1),
    RadioApiError,
  );
});

test("el cliente corta una consulta que supera el timeout", async (t) => {
  const url = await api(t, (_request, response) => {
    setTimeout(() => response.end("{}"), 100);
  });
  await assert.rejects(
    new RadioClient(url, "test", 20).playback(1),
    RadioApiError,
  );
});
