import { type ProcessManager } from "./process-manager.ts";

/**
 * Register SIGINT and SIGTERM handlers that clean up all tracked subprocesses.
 * Uses a shuttingDown guard to prevent double-cleanup.
 */
export function setupSignalHandlers(pm: ProcessManager): void {
  let shuttingDown = false;

  const handler = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    await pm.killAll();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };

  process.on("SIGINT", () => handler("SIGINT"));
  process.on("SIGTERM", () => handler("SIGTERM"));
}
