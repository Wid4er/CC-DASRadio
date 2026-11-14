const $ = (id) => document.getElementById(id);
let listenerId = null;
let state = null;
let receivedAt = performance.now();
let context;
let gain;
let source;
let sourceAt = 0;
let sourceOffset = 0;
let playbackId;
let busy = false;
let polling = false;
let syncVersion = 0;
const audioCache = new Map();
const labels = {
  idle: "EN PAUSA",
  loading: "PREPARANDO",
  playing: "EN EMISIÓN",
  paused: "EN PAUSA",
  error: "SIN CONEXIÓN",
};

function feedback(text, error = false) {
  $("feedback").textContent = text;
  $("feedback").classList.toggle("error", error);
}

async function request(path, method = "GET", keepalive = false) {
  const response = await fetch(path, {
    method,
    keepalive,
    signal: AbortSignal.timeout(8000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "No se puede conectar con la emisora.");
  return result;
}

function stopSource() {
  if (source) {
    source.stop();
    source.disconnect();
    source = null;
  }
  playbackId = null;
}

function expectedPosition() {
  if (!state) return 0;
  return Math.min(
    state.track?.duration_ms ?? 0,
    state.position_ms +
      (state.status === "playing" ? performance.now() - receivedAt : 0),
  );
}

async function syncAudio(version) {
  if (
    !listenerId ||
    !state.track ||
    !["playing", "loading"].includes(state.status)
  ) {
    stopSource();
    return;
  }
  if (state.status === "loading") stopSource();
  const track = state.track;
  const generation = state.playback_id;
  if (!audioCache.has(track.id)) {
    const id = listenerId;
    const promise = fetch(
      `/api/audio/${track.id}?listener=${encodeURIComponent(id)}`,
    )
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo cargar el audio.");
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .catch((error) => {
        audioCache.delete(track.id);
        throw error;
      });
    audioCache.set(track.id, promise);
    if (audioCache.size > 2) audioCache.delete(audioCache.keys().next().value);
  }
  const buffer = await audioCache.get(track.id);
  if (
    state.status !== "playing" ||
    version !== syncVersion ||
    !listenerId ||
    generation !== state.playback_id
  )
    return;
  const expected = expectedPosition() / 1000;
  const actual = sourceOffset + (context.currentTime - sourceAt);
  // Mantener el recurso continuo: una respuesta tardía no debe repetir audio.
  // Solo buscar hacia delante si el navegador se ha quedado claramente atrás.
  if (playbackId === generation && source && expected - actual < 5) return;
  stopSource();
  if (expected >= buffer.duration - 0.03) return;
  source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);
  sourceAt = context.currentTime + 0.03;
  sourceOffset = Math.max(0, expected + 0.03);
  source.start(sourceAt, Math.min(sourceOffset, buffer.duration - 0.01));
  playbackId = generation;
}

async function update(next) {
  if (
    state?.playback_id === next.playback_id &&
    state.status === "playing" &&
    next.status === "playing"
  ) {
    next = {
      ...next,
      position_ms: Math.max(next.position_ms, expectedPosition()),
    };
  }
  state = next;
  receivedAt = performance.now();
  $("status").textContent =
    state.status === "loading" && state.intermission_remaining_ms > 0
      ? "ENTRE CANCIONES"
      : (labels[state.status] ?? "EN PAUSA");
  $("live-dot").classList.toggle("on", state.status === "playing");
  $("listeners").textContent = state.listeners;
  $("listener-label").textContent =
    state.listeners === 1 ? "oyente conectado" : "oyentes conectados";
  $("title").textContent = state.track?.title ?? "Tu sitio está reservado.";
  $("artist").textContent =
    state.track?.artist ?? "Pulsa conectar para empezar a escuchar.";
  document.body.classList.toggle(
    "listening",
    Boolean(listenerId && state.status === "playing"),
  );
  if (state.status === "error")
    throw new Error(
      "La emisora está recuperando la conexión. Vuelve a conectar en unos segundos.",
    );
  await syncAudio(++syncVersion);
}

function buttons() {
  $("connect").disabled = busy;
  $("button-label").textContent = busy
    ? "Conectando…"
    : listenerId
      ? "Desconectar"
      : "Conectar y escuchar";
  $("button-icon").textContent = listenerId ? "■" : "▶";
}

async function disconnect() {
  const id = listenerId;
  listenerId = null;
  syncVersion++;
  stopSource();
  document.body.classList.remove("listening");
  buttons();
  if (id) await request(`/api/listeners/${id}/leave`, "POST", true);
}

$("connect").addEventListener("click", async () => {
  if (busy) return;
  if (listenerId) {
    try {
      await disconnect();
      feedback("Has salido de la emisora. Puedes volver cuando quieras.");
    } catch {
      feedback(
        "Has salido. La emisora detectará la desconexión automáticamente.",
      );
    }
    return;
  }
  busy = true;
  buttons();
  try {
    // Desbloquear el audio dentro del gesto del usuario, antes de esperar a la red.
    context ??= new AudioContext();
    gain ??= context.createGain();
    gain.gain.value = Number($("volume").value) / 100;
    gain.disconnect();
    gain.connect(context.destination);
    await context.resume();
    const joined = await request("/api/listeners", "POST");
    listenerId = joined.listener_id;
    await update(joined.state);
    feedback("Estás escuchando la emisora compartida.");
  } catch (error) {
    await disconnect().catch(() => {});
    feedback(error.message, true);
  } finally {
    busy = false;
    buttons();
  }
});

$("volume").addEventListener("input", () => {
  if (gain) gain.gain.value = Number($("volume").value) / 100;
});

async function poll() {
  if (polling || busy) return;
  polling = true;
  try {
    const next = await request(
      listenerId ? `/api/listeners/${listenerId}/heartbeat` : "/api/state",
      listenerId ? "POST" : "GET",
    );
    await update(next);
    if (!listenerId && $("feedback").classList.contains("error"))
      feedback("No necesitas una cuenta de Discord.");
  } catch (error) {
    if (listenerId) await disconnect().catch(() => {});
    feedback(error.message, true);
  } finally {
    polling = false;
  }
}

const formatTime = (ms) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
function renderTime() {
  const position = expectedPosition();
  const duration = state?.track?.duration_ms ?? 0;
  const percent = duration ? Math.min(100, (position / duration) * 100) : 0;
  $("position").textContent = formatTime(position);
  $("duration").textContent = formatTime(duration);
  $("progress").style.width = `${percent}%`;
  $("progress").parentElement.setAttribute(
    "aria-valuenow",
    String(Math.round(percent)),
  );
  requestAnimationFrame(renderTime);
}
window.addEventListener("pagehide", () => {
  if (listenerId) navigator.sendBeacon(`/api/listeners/${listenerId}/leave`);
});
setInterval(() => {
  void poll();
}, 500);
void poll();
renderTime();
