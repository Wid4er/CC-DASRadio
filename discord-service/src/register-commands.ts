import { REST } from "discord.js";
import { ensureGlobalRadioCommand } from "./command-registration.js";
import { required } from "./config.js";

async function main() {
  const rest = new REST({ version: "10" }).setToken(
    required(process.env, "DISCORD_TOKEN"),
  );
  const applicationId = required(process.env, "DISCORD_CLIENT_ID");
  await ensureGlobalRadioCommand(rest, applicationId);
  console.log(
    "Comandos /radio start, /radio stop y /radio now registrados globalmente para los servidores del bot.",
  );
}

main().catch(() => {
  console.error(
    "No se pudo registrar /radio. Revisa la configuración y permisos del bot.",
  );
  process.exitCode = 1;
});
