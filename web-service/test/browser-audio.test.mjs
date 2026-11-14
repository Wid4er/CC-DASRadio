import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const app = await readFile(
  new URL("../public/app.js", import.meta.url),
  "utf8",
);
const navigation = await readFile(
  new URL("../public/navigation.js", import.meta.url),
  "utf8",
);

async function browser() {
  let clock = 0;
  let audioLag = 0;
  let networkDelay = 0;
  let generation = "first";
  let origin = 0;
  let status = "playing";
  let intermission = 0;
  let trackId = 1;
  const downloads = [];
  const sources = [];
  const requests = [];
  const beacons = [];
  const elements = new Map();
  const documentEvents = new Map();
  const windowEvents = new Map();
  const sections = ["radio", "music", "discord"].map((page) => ({
    dataset: { page },
    hidden: page !== "radio",
  }));
  const links = sections.map((section) => ({
    dataset: { nav: section.dataset.page },
    setAttribute() {},
    removeAttribute() {},
  }));
  const window = {
    location: new URL("http://radio.test/"),
    history: {
      pushState(_state, _unused, url) {
        window.location = new URL(url);
      },
    },
    scrollTo() {},
    addEventListener(event, handler) {
      windowEvents.set(event, handler);
    },
  };
  const document = {
    getElementById: element,
    body: { classList: classes() },
    querySelectorAll: (selector) =>
      selector === "[data-page]" ? sections : links,
    querySelector: () => ({ focus() {} }),
    addEventListener(event, handler) {
      documentEvents.set(event, handler);
    },
  };
  function classes() {
    return { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  function element(id) {
    if (!elements.has(id))
      elements.set(id, {
        value: "65",
        classList: classes(),
        style: {},
        textContent: "",
        parentElement: { setAttribute() {} },
        addEventListener(event, handler) {
          this[event] = handler;
        },
      });
    return elements.get(id);
  }
  function state() {
    return {
      position_ms: status === "loading" ? 0 : clock - origin,
      playback_id: generation,
      status,
      intermission_remaining_ms: intermission,
      listeners: 1,
      track: {
        id: trackId,
        title: "Prueba",
        artist: "Autor",
        duration_ms: 200000,
      },
    };
  }
  class AudioContext {
    get currentTime() {
      return (clock - audioLag) / 1000;
    }
    async resume() {}
    createGain() {
      return { gain: {}, connect() {}, disconnect() {} };
    }
    async decodeAudioData() {
      return { duration: 200 };
    }
    createBufferSource() {
      const source = {
        stopped: false,
        connect() {},
        disconnect() {},
        stop() {
          this.stopped = true;
        },
        start(at, offset) {
          this.at = at;
          this.offset = offset;
        },
      };
      sources.push(source);
      return source;
    }
  }
  const context = vm.createContext({
    document,
    window,
    URL,
    navigator: { sendBeacon: (path) => beacons.push(path) },
    AudioContext,
    AbortSignal,
    performance: { now: () => clock },
    requestAnimationFrame() {},
    setInterval() {},
    fetch: async (path) => {
      requests.push(path);
      if (path.startsWith("/api/audio/")) downloads.push(path);
      const sample = state();
      if (path.endsWith("/heartbeat")) clock += networkDelay;
      return {
        ok: true,
        json: async () =>
          path === "/api/listeners"
            ? { listener_id: "session", state: sample }
            : sample,
        arrayBuffer: async () => new ArrayBuffer(4),
      };
    },
  });
  vm.runInContext(app, context);
  vm.runInContext(navigation, context);
  await new Promise((resolve) => setImmediate(resolve));
  await element("connect").click();
  assert.equal(sources.length, 1);
  return {
    sources,
    downloads,
    requests,
    beacons,
    get visiblePage() {
      return sections.find((section) => !section.hidden).dataset.page;
    },
    get pageTitle() {
      return document.title;
    },
    navigate(path, options = {}) {
      let prevented = false;
      const link = {
        href: new URL(path, window.location).href,
        target: options.target ?? "",
        hasAttribute: () => false,
      };
      documentEvents.get("click")({
        button: 0,
        ...options,
        target: { closest: () => link },
        preventDefault() {
          prevented = true;
        },
      });
      return prevented;
    },
    popstate(path) {
      window.location = new URL(path, window.location);
      windowEvents.get("popstate")();
    },
    async poll(delay = 0, elapsed = 500) {
      networkDelay = delay;
      clock += elapsed;
      await vm.runInContext("poll()", context);
    },
    nextSong() {
      generation = "second";
      origin = clock;
    },
    intermission() {
      generation = "second";
      trackId = 2;
      status = "loading";
      intermission = 5000;
    },
    beginMusic() {
      status = "playing";
      intermission = 0;
      origin = clock;
    },
    suspendAudio(ms) {
      audioLag += ms;
    },
  };
}

test("una respuesta tardía no rebobina ni reinicia el audio de la misma canción", async () => {
  const page = await browser();
  for (let i = 0; i < 20; i++) await page.poll(i % 3 === 0 ? 800 : 0);
  assert.equal(
    page.sources.length,
    1,
    "las demoras de red no deben recrear el reproductor",
  );
  assert.equal(page.sources[0].stopped, false);
});

test("las guías y Atrás conservan el audio y la misma sesión de escucha", async () => {
  const page = await browser();
  for (const [path, visible, title] of [
    ["/ayuda/musica", "music", "Cargar música · DAS Radio"],
    ["/ayuda/discord", "discord", "Configurar Discord · DAS Radio"],
  ]) {
    assert.equal(page.navigate(path), true);
    assert.equal(page.visiblePage, visible);
    assert.equal(page.pageTitle, title);
    await page.poll();
  }
  page.popstate("/ayuda/musica");
  assert.equal(page.visiblePage, "music");
  assert.equal(page.navigate("/"), true);
  assert.equal(page.visiblePage, "radio");
  await page.poll();
  assert.equal(page.sources.length, 1);
  assert.equal(page.sources[0].stopped, false);
  assert.equal(page.downloads.length, 1);
  assert.equal(
    page.requests.filter((path) => path === "/api/listeners").length,
    1,
  );
  assert.equal(
    page.requests.filter((path) => path.endsWith("/leave")).length,
    0,
  );
  assert.equal(page.beacons.length, 0);
});

test("los enlaces externos y abrir otra pestaña mantienen su comportamiento", async () => {
  const page = await browser();
  assert.equal(
    page.navigate("https://discord.com/developers/applications"),
    false,
  );
  assert.equal(page.navigate("/ayuda/musica", { ctrlKey: true }), false);
  assert.equal(page.navigate("/ayuda/discord", { target: "_blank" }), false);
  assert.equal(page.visiblePage, "radio");
  assert.equal(page.sources[0].stopped, false);
});

test("otra reproducción de la misma pista sí reemplaza el recurso de audio", async () => {
  const page = await browser();
  await page.poll();
  page.nextSong();
  await page.poll(0, 0);
  assert.equal(page.sources.length, 2);
  assert.equal(page.sources[0].stopped, true);
  assert.ok(page.sources[1].offset < 0.1);
});

test("un desfase menor de cinco segundos no reinicia el recurso", async () => {
  const page = await browser();
  page.suspendAudio(3000);
  await page.poll(0, 3000);
  assert.equal(page.sources.length, 1);
});

test("un retraso superior a cinco segundos se recupera hacia delante", async () => {
  const page = await browser();
  page.suspendAudio(6000);
  await page.poll(0, 6000);
  assert.equal(page.sources.length, 2);
  assert.ok(page.sources[1].offset >= 6);
});

test("la pausa entre canciones permite precargar sin emitir audio y retomar la pista nueva", async () => {
  const page = await browser();
  page.intermission();
  await page.poll(0, 0);
  assert.equal(page.sources[0].stopped, true);
  assert.equal(page.sources.length, 1);
  assert.equal(page.downloads.length, 2);
  await page.poll(0, 4999);
  assert.equal(page.sources.length, 1);
  page.beginMusic();
  await page.poll(0, 1);
  assert.equal(page.sources.length, 2);
  assert.equal(page.downloads.length, 2, "la nueva pista ya estaba precargada");
  assert.ok(page.sources[1].offset < 0.1);
});
