import {
  ChannelType,
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { type SharedRadio, VoiceUserError } from "./shared-radio.js";
import { connectVoice } from "./voice-connection.js";
import type { VoiceOutput } from "./voice-output.js";

export async function handleVoice(
  interaction: ChatInputCommandInteraction,
  radio: SharedRadio,
  output: VoiceOutput,
) {
  await interaction.deferReply();
  try {
    if (!interaction.inCachedGuild())
      throw new VoiceUserError(
        "Usa este comando dentro de un servidor de Discord.",
      );
    let content: string;
    if (interaction.options.getSubcommand() === "stop") {
      content = await radio.stop(interaction.guildId);
    } else {
      const channel = interaction.member.voice.channel;
      if (!channel || channel.type !== ChannelType.GuildVoice)
        throw new VoiceUserError(
          "Entra primero en un canal de voz del servidor y ejecuta /radio start. Los canales de escenario no están incluidos.",
        );
      const bot =
        interaction.guild.members.me ??
        (await interaction.guild.members.fetchMe());
      if (
        !channel
          .permissionsFor(bot)
          ?.has([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
          ])
      )
        throw new VoiceUserError(
          "Necesito los permisos Ver canal, Conectar y Hablar en tu canal de voz.",
        );
      if (bot.voice.serverMute)
        throw new VoiceUserError(
          "Estoy silenciado por el servidor. Quita ese silencio antes de iniciar la radio.",
        );
      content = await radio.start(interaction.guildId, channel.id, () =>
        connectVoice(channel, output, () => {
          void radio.stop(interaction.guildId).catch(() => {});
        }),
      );
    }
    await interaction.editReply({ content, allowedMentions: { parse: [] } });
  } catch (error) {
    const content =
      error instanceof VoiceUserError
        ? error.message
        : "No se pudo iniciar la reproducción. Comprueba el proveedor de radio y vuelve a intentarlo.";
    await interaction.editReply({ content, allowedMentions: { parse: [] } });
  }
}
