import { type REST, Routes } from "discord.js";
import { radioCommand } from "./commands.js";

// Discord añade IDs, versiones y valores predeterminados a la definición registrada.
// Comparar solo los campos declarados evita publicar de nuevo en cada arranque.
function matches(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    // Discord omite options cuando una suborden no tiene parámetros.
    if (expected.length === 0 && (actual === undefined || actual === null))
      return true;
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item, index) => matches(actual[index], item))
    );
  }
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object") return false;
    const fields = actual as Record<string, unknown>;
    return Object.entries(expected).every(
      ([key, value]) => value === undefined || matches(fields[key], value),
    );
  }
  return actual === expected;
}

export async function ensureGlobalRadioCommand(
  rest: Pick<REST, "get" | "post">,
  applicationId: string,
) {
  const route = Routes.applicationCommands(applicationId);
  const commands = await rest.get(route);
  if (!Array.isArray(commands))
    throw new Error("Respuesta de comandos no válida.");
  const desired = radioCommand.toJSON();
  if (commands.some((command) => matches(command, desired))) return false;
  // Actualiza únicamente /radio; no sobrescribe los demás comandos de la aplicación.
  await rest.post(route, { body: desired });
  return true;
}
