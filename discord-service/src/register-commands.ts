import { REST, Routes } from "discord.js";
import { radioCommand } from "./commands.js";
import { required } from "./config.js";

async function main() {
  const rest = new REST({ version: "10" }).setToken(
    required(process.env, "DISCORD_TOKEN"),
  );
  const applicationId = required(process.env, "DISCORD_CLIENT_ID");
  const guildId = required(process.env, "DISCORD_GUILD_ID");
  // Upsert únicamente /radio: conserva otros comandos de la aplicación.
  await rest.post(Routes.applicationGuildCommands(applicationId, guildId), {
    body: radioCommand.toJSON(),
  });
  console.log("Comando /radio now registrado en el servidor de pruebas.");
}

main().catch(() => {
  console.error(
    "No se pudo registrar /radio. Revisa la configuración y permisos del bot.",
  );
  process.exitCode = 1;
});
