import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";

const url = process.env.WEB_SERVICE_URL ?? "http://web-service:8080";
const sessions = [];
async function request(path, method = "GET") {
  const response = await fetch(`${url}${path}`, {
    method,
    signal: AbortSignal.timeout(10000),
  });
  assert.ok(response.ok, `${method} ${path}: ${response.status}`);
  return response.json();
}
try {
  await request("/health");
  const a = await request("/api/listeners", "POST");
  sessions.push(a.listener_id);
  const b = await request("/api/listeners", "POST");
  sessions.push(b.listener_id);
  assert.equal(a.state.playback_id, b.state.playback_id);
  assert.equal(a.state.current_track_id, b.state.current_track_id);
  assert.ok(b.state.listeners >= 2);
  const audio = await fetch(
    `${url}/api/audio/${a.state.current_track_id}?listener=${a.listener_id}`,
    {
      headers: { Range: "bytes=0-3" },
      signal: AbortSignal.timeout(10000),
    },
  );
  assert.equal(audio.status, 206);
  const prefix = new Uint8Array(await audio.arrayBuffer());
  const type = audio.headers.get("content-type").split(";")[0];
  if (type === "audio/wav")
    assert.equal(new TextDecoder().decode(prefix), "RIFF");
  else if (type === "audio/mpeg") {
    assert.ok(
      new TextDecoder().decode(prefix.subarray(0, 3)) === "ID3" ||
        (prefix[0] === 255 && (prefix[1] & 224) === 224),
    );
  } else assert.fail(`Tipo de audio no contemplado en esta prueba: ${type}`);
  await setTimeout(350);
  const left = await request(`/api/listeners/${a.listener_id}/leave`, "POST");
  assert.ok(["playing", "loading"].includes(left.status));
  await request(`/api/listeners/${b.listener_id}/leave`, "POST");
  const state = await request("/api/state");
  if (!state.listeners) assert.equal(state.status, "paused");
  console.log(
    "Web → API → PostgreSQL: audio real, dos oyentes compartidos y desconexión correctos.",
  );
} finally {
  await Promise.all(
    sessions.map((id) =>
      request(`/api/listeners/${id}/leave`, "POST").catch(() => {}),
    ),
  );
}
