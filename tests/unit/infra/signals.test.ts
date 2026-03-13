import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { setupSignalHandlers } from "../../../src/infra/signals.ts";

describe("setupSignalHandlers", () => {
  const originalOn = process.on.bind(process);
  const originalExit = process.exit;

  // biome-ignore lint/complexity/noBannedTypes: test mock needs generic function type
  let registeredHandlers: Record<string, Function>;
  let mockKillAll: ReturnType<typeof mock>;
  let mockExit: ReturnType<typeof mock>;

  beforeEach(() => {
    registeredHandlers = {};
    mockKillAll = mock(() => Promise.resolve());
    mockExit = mock((_code?: number) => {}) as any;

    // Spy on process.on to capture signal handlers
    // biome-ignore lint/complexity/noBannedTypes: test mock needs generic function type
    process.on = ((signal: string, handler: Function) => {
      registeredHandlers[signal] = handler;
      return process;
    }) as any;

    process.exit = mockExit as any;
  });

  afterEach(() => {
    process.on = originalOn as any;
    process.exit = originalExit;
  });

  it("registers SIGINT and SIGTERM handlers via process.on", () => {
    const pm = { killAll: mockKillAll } as any;
    setupSignalHandlers(pm);

    expect(registeredHandlers.SIGINT).toBeDefined();
    expect(registeredHandlers.SIGTERM).toBeDefined();
  });

  it("SIGINT handler calls killAll() then process.exit(130)", async () => {
    const pm = { killAll: mockKillAll } as any;
    setupSignalHandlers(pm);

    await registeredHandlers.SIGINT();

    expect(mockKillAll).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledWith(130);
  });

  it("SIGTERM handler calls killAll() then process.exit(143)", async () => {
    const pm = { killAll: mockKillAll } as any;
    setupSignalHandlers(pm);

    await registeredHandlers.SIGTERM();

    expect(mockKillAll).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledWith(143);
  });

  it("shuttingDown guard prevents double cleanup on rapid signals", async () => {
    const pm = { killAll: mockKillAll } as any;
    setupSignalHandlers(pm);

    // Fire both signals rapidly
    await Promise.all([registeredHandlers.SIGINT(), registeredHandlers.SIGTERM()]);

    // killAll should only be called once due to the guard
    expect(mockKillAll).toHaveBeenCalledTimes(1);
  });

  it("killAll() is awaited before process.exit is called", async () => {
    const callOrder: string[] = [];

    mockKillAll = mock(async () => {
      callOrder.push("killAll");
    });
    mockExit = mock((_code?: number) => {
      callOrder.push("exit");
    }) as any;
    process.exit = mockExit as any;

    const pm = { killAll: mockKillAll } as any;
    setupSignalHandlers(pm);

    await registeredHandlers.SIGINT();

    expect(callOrder).toEqual(["killAll", "exit"]);
  });
});
