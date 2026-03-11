import type { Subprocess } from "bun";

/**
 * Tracks spawned subprocesses and ensures cleanup on shutdown.
 * Sends SIGTERM first, then force-kills with SIGKILL after 5s timeout.
 */
export class ProcessManager {
  private processes = new Set<Subprocess>();

  /** Add a subprocess to the tracking set. Automatically removes it when it exits. */
  track(proc: Subprocess): void {
    this.processes.add(proc);
    proc.exited.then(() => {
      this.processes.delete(proc);
    });
  }

  /** Kill all tracked processes. SIGTERM first, SIGKILL after 5s timeout. */
  async killAll(): Promise<void> {
    const kills = [...this.processes].map(async (proc) => {
      if (!proc.killed) {
        proc.kill("SIGTERM");
        const timeout = setTimeout(() => {
          if (!proc.killed) {
            proc.kill("SIGKILL");
          }
        }, 5000);
        try { await proc.exited; } finally { clearTimeout(timeout); }
      }
    });
    await Promise.allSettled(kills);
    this.processes.clear();
  }
}
