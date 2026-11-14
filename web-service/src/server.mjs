import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { RadioClient, RadioError } from "./radio-client.mjs";
import { Station } from "./station.mjs";

const pages = new Map([
  ["/", { name: "radio", title: "DAS Radio · Escucha compartida" }],
  [
    "/ayuda/discord",
    { name: "discord", title: "Configurar Discord · DAS Radio" },
  ],
  ["/ayuda/musica", { name: "music", title: "Cargar música · DAS Radio" }],
]);
const files = new Map([
  ...[...pages.keys()].map((route) => [
    route,
    ["index.html", "text/html; charset=utf-8"],
  ]),
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/navigation.js", ["navigation.js", "text/javascript; charset=utf-8"]],
]);

export function audioRange(range, length) {
  if (!range) return [0, length - 1];
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, length - Number(match[2]));
  const end =
    match[1] && match[2] ? Math.min(Number(match[2]), length - 1) : length - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start > end ||
    start >= length
  )
    return null;
  return [start, end];
}

export async function createWebService(radio, options = {}) {
  const station = new Station(radio, options);
  await station.initialize();
  const guides = await Promise.all(
    ["discord", "music"].map(async (name) => [
      `<!-- ${name.toUpperCase()}_GUIDE -->`,
      await readFile(
        new URL(`../public/${name}.html`, import.meta.url),
        "utf8",
      ),
    ]),
  );
  const assets = new Map(
    await Promise.all(
      [...files].map(async ([route, [name, type]]) => {
        let body = await readFile(
          new URL(`../public/${name}`, import.meta.url),
        );
        const page = pages.get(route);
        if (page) {
          let html = body.toString("utf8");
          for (const [placeholder, content] of guides) {
            html = html.replace(placeholder, content);
          }
          body = Buffer.from(
            html
              .replace(
                "<title>DAS Radio · Escucha compartida</title>",
                `<title>${page.title}</title>`,
              )
              .replaceAll(
                `data-page="${page.name}" hidden`,
                `data-page="${page.name}"`,
              )
              .replace(
                `data-nav="${page.name}"`,
                `data-nav="${page.name}" aria-current="page"`,
              )
              .replace(
                "<body>",
                page.name === "radio"
                  ? "<body>"
                  : '<body class="reading-guide">',
              ),
          );
        }
        return [route, { type, body }];
      }),
    ),
  );
  const timer = setInterval(() => {
    void station.tick();
  }, 250);
  timer.unref();
  let shuttingDown = false;
  const server = createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    const json = (status, value) => {
      response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify(value));
    };
    if (shuttingDown)
      return json(503, { error: "La emisora se está deteniendo." });
    try {
      const url = new URL(request.url, "http://localhost");
      if (!["GET", "HEAD", "POST"].includes(request.method)) {
        return json(405, { error: "Método no permitido." });
      }
      if (
        request.method === "POST" &&
        request.headers.origin &&
        new URL(request.headers.origin).host !== request.headers.host
      ) {
        return json(403, { error: "Origen no permitido." });
      }
      if (request.method === "GET" && url.pathname === "/health") {
        await radio.health();
        return json(200, { status: "ok" });
      }
      if (request.method === "GET" && url.pathname === "/api/state") {
        return json(200, await station.status());
      }
      if (request.method === "POST" && url.pathname === "/api/listeners") {
        return json(201, await station.join());
      }
      const listener =
        /^\/api\/listeners\/([a-f0-9-]{36})\/(heartbeat|leave)$/.exec(
          url.pathname,
        );
      if (listener && request.method === "POST") {
        const state =
          listener[2] === "leave"
            ? await station.leave(listener[1])
            : await station.heartbeat(listener[1]);
        return json(200, state);
      }
      const audio = /^\/api\/audio\/([1-9][0-9]*)$/.exec(url.pathname);
      if (audio && ["GET", "HEAD"].includes(request.method)) {
        const id = url.searchParams.get("listener");
        if (!station.listeners.has(id))
          throw new RadioError(410, "listener_expired");
        const { data, contentType } = await station.audio(Number(audio[1]));
        const range = audioRange(request.headers.range, data.length);
        if (!range) {
          response.writeHead(416, {
            "Content-Range": `bytes */${data.length}`,
          });
          return response.end();
        }
        const [start, end] = range;
        response.setHeader("Content-Type", contentType);
        response.setHeader("Accept-Ranges", "bytes");
        response.setHeader("Content-Length", end - start + 1);
        if (request.headers.range)
          response.setHeader(
            "Content-Range",
            `bytes ${start}-${end}/${data.length}`,
          );
        response.writeHead(request.headers.range ? 206 : 200);
        return response.end(
          request.method === "HEAD" ? undefined : data.subarray(start, end + 1),
        );
      }
      const asset = assets.get(url.pathname);
      if (asset && ["GET", "HEAD"].includes(request.method)) {
        response.writeHead(200, { "Content-Type": asset.type });
        return response.end(request.method === "HEAD" ? undefined : asset.body);
      }
      return json(404, { error: "No se encuentra el recurso." });
    } catch (error) {
      const expired =
        error instanceof RadioError && error.code === "listener_expired";
      const empty =
        error instanceof RadioError && error.code === "empty_catalog";
      json(expired ? 410 : empty ? 409 : 503, {
        error: expired
          ? "La sesión ha caducado. Conecta de nuevo."
          : empty
            ? "La emisora no tiene audio disponible."
            : "No se puede acceder a la emisora. Vuelve a intentarlo.",
      });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return {
    server,
    station,
    async close() {
      shuttingDown = true;
      clearInterval(timer);
      try {
        await station.close();
      } finally {
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
  };
}

async function main() {
  const port = Number(process.env.PORT ?? 8080);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new Error("Puerto inválido.");
  const radio = new RadioClient({
    url: process.env.RADIO_SERVICE_URL ?? "http://radio-service:8000",
    token: process.env.SERVICE_TOKEN,
    stationId: Number(process.env.STATION_ID ?? 1),
  });
  const app = await createWebService(radio);
  app.server.listen(port, "0.0.0.0", () =>
    console.log(`CC-DASRadio web disponible en el puerto ${port}.`),
  );
  let closing = false;
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      if (closing) return;
      closing = true;
      const timeout = setTimeout(() => process.exit(1), 8000);
      timeout.unref();
      app
        .close()
        .then(() => process.exit(0))
        .catch(() => {
          console.error("No se pudo guardar el último punto de reproducción.");
          process.exit(1);
        });
    });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error(
      "No se pudo iniciar el cliente web. Revisa su configuración y la API.",
    );
    process.exitCode = 1;
  });
}
