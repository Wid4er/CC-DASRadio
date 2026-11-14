import assert from "node:assert/strict";
import { getCiphers } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import {
  generateDependencyReport,
  NoSubscriberBehavior,
} from "@discordjs/voice";
import { required } from "./config.js";
import { RadioClient } from "./radio-client.js";
import { VoiceOutput } from "./voice-output.js";

async function main() {
  const stationId = Number(process.env.STATION_ID ?? "1");
  const radio = new RadioClient(
    process.env.RADIO_SERVICE_URL ?? "http://radio-service:8000",
    required(process.env, "SERVICE_TOKEN"),
  );
  const output = new VoiceOutput(NoSubscriberBehavior.Play);
  // Consumir paquetes localmente para probar el codificador sin enviar audio a Discord.
  const joined = await radio.join(stationId);
  try {
    const track = joined.state.track;
    assert.ok(track);
    assert.ok(getCiphers().includes("aes-256-gcm"));
    const dependencies = generateDependencyReport();
    assert.match(dependencies, /davey: (?!not found)/);
    const data = await radio.audio(track.id);
    const offset = Math.min(1000, Math.floor(track.duration_ms / 2));
    await output.play(data, offset);
    await setTimeout(100);
    assert.ok((output.position() ?? 0) >= offset + 20);
    console.log(
      "API → MP3/WAV → FFmpeg → paquetes Opus: correcto; DAVE y AES disponibles. Sin envío a Discord.",
    );
  } finally {
    output.stop();
    await radio.leave(stationId, joined.listener_id);
  }
}

main().catch(() => {
  console.error(
    "Falló la comprobación del audio Opus o las dependencias de voz.",
  );
  process.exitCode = 1;
});
