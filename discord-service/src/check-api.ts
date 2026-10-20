import { required } from "./config.js";
import { formatNow } from "./now.js";
import { RadioClient } from "./radio-client.js";

async function main() {
  const stationId = Number(process.env.STATION_ID ?? "1");
  if (!Number.isSafeInteger(stationId) || stationId <= 0)
    throw new Error("Emisora inválida.");
  const radio = new RadioClient(
    process.env.RADIO_SERVICE_URL ?? "http://radio-service:8000",
    required(process.env, "SERVICE_TOKEN"),
  );
  console.log(formatNow(await radio.playback(stationId)));
}

main().catch(() => {
  console.error("No se pudo consultar la emisora desde discord-service.");
  process.exitCode = 1;
});
