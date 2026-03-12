import { describe, expect, it } from "bun:test";

import { ProcessManager } from "../../../src/infra/process-manager.ts";

/** Creates a mock subprocess for testing */
function createMockProcess(options: { killed?: boolean; exitImmediately?: boolean } = {}) {
  let killCalled = false;
  let killSignal: string | undefined;
  let killed = options.killed ?? false;
  let exitResolve: () => void;

  const exitedPromise = new Promise<void>((resolve) => {
    exitResolve = resolve;
    if (options.exitImmediately) {
      resolve();
    }
  });

  const proc = {
    get killed() {
      return killed;
    },
    kill(signal?: string) {
      killCalled = true;
      killSignal = signal;
      killed = true;
      // Simulate process exit after kill
      exitResolve();
    },
    exited: exitedPromise,
    get _killCalled() {
      return killCalled;
    },
    get _killSignal() {
      return killSignal;
    },
    // Allow tests to simulate exit
    _simulateExit() {
      killed = true;
      exitResolve();
    },
  };

  return proc;
}

describe("ProcessManager", () => {
  it("track() adds process and killAll() calls kill on it", async () => {
    const pm = new ProcessManager();
    const proc = createMockProcess();

    pm.track(proc as any);
    await pm.killAll();

    expect(proc._killCalled).toBe(true);
  });

  it("killAll() sends SIGTERM to tracked processes", async () => {
    const pm = new ProcessManager();
    const proc = createMockProcess();

    pm.track(proc as any);
    await pm.killAll();

    expect(proc._killSignal).toBe("SIGTERM");
  });

  it("killAll() handles already-exited processes gracefully", async () => {
    const pm = new ProcessManager();
    const proc = createMockProcess({ killed: true, exitImmediately: true });

    pm.track(proc as any);

    // Should not throw
    await pm.killAll();
    // Should not call kill on an already-killed process
    expect(proc._killCalled).toBe(false);
  });

  it("process removed from tracking after it exits", async () => {
    const pm = new ProcessManager();
    const proc = createMockProcess();

    pm.track(proc as any);

    // Simulate the process exiting
    proc._simulateExit();
    // Allow the exited promise handler to run
    await new Promise((resolve) => setTimeout(resolve, 10));

    // After exit, tracking set should be empty
    // killAll should not try to kill the process since it was removed
    const proc2 = createMockProcess();
    pm.track(proc2 as any);
    await pm.killAll();

    // Only proc2 should have been killed, not proc
    expect(proc._killCalled).toBe(false);
    expect(proc2._killCalled).toBe(true);
  });

  it("killAll() handles multiple processes", async () => {
    const pm = new ProcessManager();
    const proc1 = createMockProcess();
    const proc2 = createMockProcess();
    const proc3 = createMockProcess();

    pm.track(proc1 as any);
    pm.track(proc2 as any);
    pm.track(proc3 as any);

    await pm.killAll();

    expect(proc1._killCalled).toBe(true);
    expect(proc2._killCalled).toBe(true);
    expect(proc3._killCalled).toBe(true);
  });

  it("killAll() clears tracking set after completion", async () => {
    const pm = new ProcessManager();
    const proc = createMockProcess();

    pm.track(proc as any);
    await pm.killAll();

    // Track a new process and kill again - should only affect the new one
    const proc2 = createMockProcess();
    pm.track(proc2 as any);
    await pm.killAll();

    expect(proc2._killCalled).toBe(true);
  });
});
