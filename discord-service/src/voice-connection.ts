import {
  entersState,
  joinVoiceChannel,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import type { VoiceChannel } from "discord.js";
import { type VoiceLink, VoiceUserError } from "./shared-radio.js";
import type { VoiceOutput } from "./voice-output.js";

export async function connectVoice(
  channel: VoiceChannel,
  output: VoiceOutput,
  onLost: () => void,
): Promise<VoiceLink> {
  const connection = joinVoiceChannel({
    guildId: channel.guild.id,
    channelId: channel.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false,
  });
  let accepted = false;
  let intentional = false;
  connection.subscribe(output.player);
  connection.once(VoiceConnectionStatus.Destroyed, () => {
    if (accepted && !intentional) onLost();
  });
  connection.on("error", () => {
    console.error("Falló la conexión de voz de Discord.");
    if (connection.state.status !== VoiceConnectionStatus.Destroyed)
      connection.destroy();
  });
  connection.on(VoiceConnectionStatus.Disconnected, () => {
    void (async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5000),
        ]);
        await entersState(connection, VoiceConnectionStatus.Ready, 15000);
      } catch {
        if (connection.state.status !== VoiceConnectionStatus.Destroyed)
          connection.destroy();
      }
    })();
  });
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20000);
  } catch {
    if (connection.state.status !== VoiceConnectionStatus.Destroyed)
      connection.destroy();
    throw new VoiceUserError(
      "No he podido conectar al canal de voz. Revisa los permisos Conectar/Hablar y la conexión de red del bot.",
    );
  }
  accepted = true;
  return {
    channelId: channel.id,
    destroy() {
      intentional = true;
      if (connection.state.status !== VoiceConnectionStatus.Destroyed)
        connection.destroy();
    },
  };
}
