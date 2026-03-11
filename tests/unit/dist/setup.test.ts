import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { SUPERGHOST_HOME, MCP_NODE_MODULES } from "../../../src/dist/paths.ts";

// We test ensureMcpDependencies by mocking Bun globals and process.exit
describe("setup", () => {
  describe("ensureMcpDependencies", () => {
    const markerPath = join(
      MCP_NODE_MODULES,
      "@playwright",
      "mcp",
      "package.json",
    );

    test("skips install when marker file exists", async () => {
      // Mock Bun.file().exists() to return true
      const origFile = Bun.file;
      const mockExists = mock(() => Promise.resolve(true));
      // @ts-ignore - mock override
      Bun.file = mock((path: string) => {
        if (path === markerPath) {
          return { exists: mockExists };
        }
        return origFile(path);
      });

      // Fresh import to get unmemoized module
      const { ensureMcpDependencies } = await import(
        "../../../src/dist/setup.ts"
      );
      await ensureMcpDependencies();

      expect(mockExists).toHaveBeenCalled();
      // Restore
      // @ts-ignore
      Bun.file = origFile;
    });

    test("installs dependencies when marker missing", async () => {
      const origFile = Bun.file;
      const origWrite = Bun.write;
      const origSpawn = Bun.spawn;

      const mockExists = mock(() => Promise.resolve(false));
      const mockWrite = mock(() => Promise.resolve(0));
      const mockProc = {
        exited: Promise.resolve(0),
        stderr: { text: () => Promise.resolve("") },
      };
      const mockSpawn = mock(() => mockProc);

      // @ts-ignore
      Bun.file = mock((path: string) => {
        if (path === markerPath) {
          return { exists: mockExists };
        }
        return origFile(path);
      });
      // @ts-ignore
      Bun.write = mockWrite;
      // @ts-ignore
      Bun.spawn = mockSpawn;

      // Fresh import
      delete require.cache[require.resolve("../../../src/dist/setup.ts")];
      const { ensureMcpDependencies } = await import(
        "../../../src/dist/setup.ts"
      );
      await ensureMcpDependencies();

      // Verify package.json was written
      expect(mockWrite).toHaveBeenCalled();
      const writeCall = (mockWrite.mock.calls as unknown[][])[0];
      expect(writeCall[0]).toBe(join(SUPERGHOST_HOME, "package.json"));

      // Verify spawn was called for install
      expect(mockSpawn).toHaveBeenCalled();

      // Restore
      // @ts-ignore
      Bun.file = origFile;
      // @ts-ignore
      Bun.write = origWrite;
      // @ts-ignore
      Bun.spawn = origSpawn;
    });

    test("exits with code 1 when install fails", async () => {
      const origFile = Bun.file;
      const origWrite = Bun.write;
      const origSpawn = Bun.spawn;
      const origExit = process.exit;

      const mockExists = mock(() => Promise.resolve(false));
      const mockWrite = mock(() => Promise.resolve(0));
      const mockProc = {
        exited: Promise.resolve(1),
        stderr: { text: () => Promise.resolve("install error") },
      };
      const mockSpawn = mock(() => mockProc);
      const mockExit = mock((code?: number) => {
        throw new Error(`process.exit(${code})`);
      });

      // @ts-ignore
      Bun.file = mock((path: string) => {
        if (path === markerPath) {
          return { exists: mockExists };
        }
        return origFile(path);
      });
      // @ts-ignore
      Bun.write = mockWrite;
      // @ts-ignore
      Bun.spawn = mockSpawn;
      // @ts-ignore
      process.exit = mockExit;

      delete require.cache[require.resolve("../../../src/dist/setup.ts")];
      const { ensureMcpDependencies } = await import(
        "../../../src/dist/setup.ts"
      );

      await expect(ensureMcpDependencies()).rejects.toThrow("process.exit(1)");
      expect(mockExit).toHaveBeenCalledWith(1);

      // Restore
      // @ts-ignore
      Bun.file = origFile;
      // @ts-ignore
      Bun.write = origWrite;
      // @ts-ignore
      Bun.spawn = origSpawn;
      // @ts-ignore
      process.exit = origExit;
    });
  });
});
