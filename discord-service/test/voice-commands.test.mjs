import assert from "node:assert/strict";
import test from "node:test";
import { handleVoice } from "../dist/voice-commands.js";

function interaction(command, channel = null) {
  const replies = [];
  return {
    replies,
    guildId: "guild",
    inCachedGuild: () => true,
    options: { getSubcommand: () => command },
    member: { voice: { channel } },
    guild: { members: { me: { voice: { serverMute: false } } } },
    deferReply: async () => replies.push("deferred"),
    editReply: async (reply) => replies.push(reply),
  };
}

test("start informa de que el usuario debe entrar primero en voz", async () => {
  const input = interaction("start");
  await handleVoice(input, {}, {});
  assert.equal(input.replies[0], "deferred");
  assert.match(input.replies[1].content, /Entra primero/);
  assert.deepEqual(input.replies[1].allowedMentions, { parse: [] });
});

test("start explica los permisos faltantes sin intentar conectar", async () => {
  const input = interaction("start", {
    type: 2,
    permissionsFor: () => ({ has: () => false }),
  });
  await handleVoice(input, {}, {});
  assert.match(input.replies[1].content, /Conectar y Hablar/);
});

test("stop afecta únicamente al servidor solicitante sin exigir un rol administrativo", async () => {
  const input = interaction("stop");
  let stopped;
  await handleVoice(
    input,
    {
      stop: async (guild) => {
        stopped = guild;
        return "Desconectado";
      },
    },
    {},
  );
  assert.equal(stopped, "guild");
  assert.equal(input.replies[1].content, "Desconectado");
});

test("un fallo interno de voz no expone detalles ni credenciales", async () => {
  const input = interaction("stop");
  await handleVoice(
    input,
    {
      stop: async () => {
        throw new Error("internal-token-value");
      },
    },
    {},
  );
  assert.doesNotMatch(input.replies[1].content, /internal-token/);
});
