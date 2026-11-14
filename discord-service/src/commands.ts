import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder,
} from "discord.js";

export const radioCommand = new SlashCommandBuilder()
  .setName("radio")
  .setDescription("Escucha y consulta la emisora compartida de CC-DASRadio")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(null)
  .addSubcommand((command) =>
    command
      .setName("start")
      .setDescription("Conecta la radio a tu canal de voz"),
  )
  .addSubcommand((command) =>
    command
      .setName("stop")
      .setDescription("Desconecta la radio de este servidor"),
  )
  .addSubcommand((command) =>
    command
      .setName("now")
      .setDescription("Muestra la canción y su estado actual"),
  );
