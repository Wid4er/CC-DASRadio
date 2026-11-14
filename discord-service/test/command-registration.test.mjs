import assert from "node:assert/strict";
import test from "node:test";
import { ensureGlobalRadioCommand } from "../dist/command-registration.js";
import { radioCommand } from "../dist/commands.js";

test("el registro global no usa un servidor de pruebas y conserva los otros comandos", async () => {
  const calls = [];
  const rest = {
    get: async (route) => {
      calls.push(["GET", route]);
      return [{ name: "other", type: 1 }];
    },
    post: async (route, body) => {
      calls.push(["POST", route, body]);
    },
  };
  assert.equal(await ensureGlobalRadioCommand(rest, "123"), true);
  assert.equal(calls[0][1], "/applications/123/commands");
  assert.equal(calls[1][1], "/applications/123/commands");
  assert.equal(calls[1][2].body.name, "radio");
  assert.deepEqual(
    calls[1][2].body.options.map((x) => x.name),
    ["start", "stop", "now"],
  );
  assert.deepEqual(calls[1][2].body.contexts, [0]);
  assert.deepEqual(calls[1][2].body.integration_types, [0]);
});

test("el arranque no modifica comandos que ya coinciden aunque Discord añada metadatos", async () => {
  const current = JSON.parse(JSON.stringify(radioCommand.toJSON()));
  current.id = "command-id";
  current.version = "version-id";
  for (const option of current.options) delete option.options;
  let writes = 0;
  assert.equal(
    await ensureGlobalRadioCommand(
      {
        get: async () => [current],
        post: async () => {
          writes++;
        },
      },
      "123",
    ),
    false,
  );
  assert.equal(writes, 0);
});

test("una definición antigua de solo consulta se actualiza a los tres subcomandos", async () => {
  const current = JSON.parse(JSON.stringify(radioCommand.toJSON()));
  current.options = current.options.filter((x) => x.name === "now");
  let updated;
  assert.equal(
    await ensureGlobalRadioCommand(
      {
        get: async () => [current],
        post: async (_route, args) => {
          updated = args.body;
        },
      },
      "123",
    ),
    true,
  );
  assert.deepEqual(
    updated.options.map((x) => x.name),
    ["start", "stop", "now"],
  );
});

test("los errores de Discord no provocan una sobrescritura de todos los comandos", async () => {
  let writes = 0;
  await assert.rejects(
    ensureGlobalRadioCommand(
      {
        get: async () => {
          throw new Error("Unavailable");
        },
        post: async () => {
          writes++;
        },
      },
      "123",
    ),
  );
  assert.equal(writes, 0);
});
