import type { ChatInputCommandInteraction } from "discord.js";
import type { Playback, RadioClient } from "./radio-client.js";

export function formatNow(playback: Playback): string {
  if (!playback.track)
    return "La emisora todavía no tiene una canción seleccionada.";
  const states = {
    idle: "Sin selección",
    loading: "Preparando audio",
    playing: "Reproduciendo",
    paused: "En pausa",
    error: "Error de reproducción",
  };
  // Limitar metadatos para respetar el tamaño máximo de un mensaje de Discord.
  const title = playback.track.title.slice(0, 600);
  const artist = playback.track.artist.slice(0, 600);
  return `${title} — ${artist}\nEstado: ${states[playback.status]}. Punto guardado: ${Math.floor(playback.position_ms / 1000)} s.`;
}

export async function handleNow(
  interaction: Pick<ChatInputCommandInteraction, "deferReply" | "editReply">,
  radio: Pick<RadioClient, "playback">,
  stationId: number,
) {
  await interaction.deferReply();
  let content: string;
  try {
    content = formatNow(await radio.playback(stationId));
  } catch {
    content =
      "No puedo consultar la emisora ahora. Inténtalo de nuevo más tarde.";
  }
  await interaction.editReply({ content, allowedMentions: { parse: [] } });
}
