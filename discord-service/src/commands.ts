import { SlashCommandBuilder } from "discord.js";

export const radioCommand = new SlashCommandBuilder()
  .setName("radio")
  .setDescription("Consulta la emisora de CC-DASRadio")
  .setDMPermission(false)
  .addSubcommand((command) =>
    command
      .setName("now")
      .setDescription("Muestra la canción y su estado actual"),
  );
