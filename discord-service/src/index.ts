import { Client, Events, GatewayIntentBits } from "discord.js";
import { ensureGlobalRadioCommand } from "./command-registration.js";
import { readConfig } from "./config.js";
import { handleNow } from "./now.js";
import { RadioClient } from "./radio-client.js";
import { SharedRadio } from "./shared-radio.js";
import { handleVoice } from "./voice-commands.js";
import { VoiceOutput } from "./voice-output.js";

async function main() {
  const config = readConfig();
  const radio = new RadioClient(config.apiUrl, config.serviceToken);
  const output = new VoiceOutput();
  const voice = new SharedRadio(radio, config.stationId, output);
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });
  const timer = setInterval(() => {
    void voice.tick();
  }, 250);
  timer.unref();

  client.once(Events.ClientReady, (ready) => {
    console.log("CC-DASRadio conectado a Discord.");
    void ensureGlobalRadioCommand(ready.rest, ready.application.id)
      .then(() =>
        console.log(
          "Comando /radio global disponible para los servidores del bot.",
        ),
      )
      .catch(() =>
        console.error(
          "No se pudo actualizar /radio global. Ejecuta register-commands.js para reintentarlo.",
        ),
      );
  });
  client.on(Events.InteractionCreate, async (interaction) => {
    if (
      !interaction.isChatInputCommand() ||
      interaction.commandName !== "radio"
    )
      return;
    if (!interaction.inGuild()) return;
    try {
      if (interaction.options.getSubcommand() === "now")
        await handleNow(
          interaction,
          { playback: (id) => radio.live(id) },
          config.stationId,
        );
      else if (["start", "stop"].includes(interaction.options.getSubcommand()))
        await handleVoice(interaction, voice, output);
    } catch {
      console.error("No se pudo responder a la interacción de Discord.");
    }
  });
  client.on(Events.Error, () =>
    console.error("Error de conexión con Discord."),
  );
  let closing = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      if (closing) return;
      closing = true;
      clearInterval(timer);
      const deadline = setTimeout(() => process.exit(1), 25000);
      deadline.unref();
      void voice.close().finally(() => {
        client.destroy();
        process.exit(0);
      });
    });
  }
  try {
    await client.login(config.discordToken);
  } catch (error) {
    clearInterval(timer);
    await voice.close();
    client.destroy();
    throw error;
  }
}

main().catch(() => {
  console.error(
    "No se pudo iniciar el bot. Revisa la configuración local y la conexión.",
  );
  process.exitCode = 1;
});
