import { Client, Events, GatewayIntentBits } from "discord.js";
import { readConfig } from "./config.js";
import { handleNow } from "./now.js";
import { RadioClient } from "./radio-client.js";

async function main() {
  const config = readConfig();
  const radio = new RadioClient(config.apiUrl, config.serviceToken);
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, () =>
    console.log("CC-DASRadio conectado a Discord."),
  );
  client.on(Events.InteractionCreate, async (interaction) => {
    if (
      !interaction.isChatInputCommand() ||
      interaction.commandName !== "radio"
    )
      return;
    if (!interaction.inGuild() || interaction.options.getSubcommand() !== "now")
      return;
    try {
      await handleNow(interaction, radio, config.stationId);
    } catch {
      console.error("No se pudo responder a la interacción de Discord.");
    }
  });
  client.on(Events.Error, () =>
    console.error("Error de conexión con Discord."),
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      client.destroy();
      process.exit(0);
    });
  }
  await client.login(config.discordToken);
}

main().catch(() => {
  console.error(
    "No se pudo iniciar el bot. Revisa la configuración local y la conexión.",
  );
  process.exitCode = 1;
});
