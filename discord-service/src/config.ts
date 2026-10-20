export function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Configura ${key} en el entorno local.`);
  return value;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const stationId = Number(env.STATION_ID ?? "1");
  if (!Number.isSafeInteger(stationId) || stationId <= 0) {
    throw new Error("STATION_ID debe ser un entero positivo.");
  }
  return {
    discordToken: required(env, "DISCORD_TOKEN"),
    apiUrl: env.RADIO_SERVICE_URL ?? "http://radio-service:8000",
    serviceToken: required(env, "SERVICE_TOKEN"),
    stationId,
  };
}
