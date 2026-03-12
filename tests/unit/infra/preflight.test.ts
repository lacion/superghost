import { afterAll, describe, expect, test } from "bun:test";

import { checkBaseUrlReachable } from "../../../src/infra/preflight.ts";

describe("checkBaseUrlReachable", () => {
  const servers: ReturnType<typeof Bun.serve>[] = [];

  afterAll(() => {
    for (const s of servers) s.stop(true);
  });

  test("resolves for reachable URL (200)", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response("OK", { status: 200 });
      },
    });
    servers.push(server);
    await expect(checkBaseUrlReachable(`http://localhost:${server.port}`)).resolves.toBeUndefined();
  });

  test("resolves for 404 response (reachability, not health)", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response("Not Found", { status: 404 });
      },
    });
    servers.push(server);
    await expect(checkBaseUrlReachable(`http://localhost:${server.port}`)).resolves.toBeUndefined();
  });

  test("resolves for 500 response", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response("Internal Server Error", { status: 500 });
      },
    });
    servers.push(server);
    await expect(checkBaseUrlReachable(`http://localhost:${server.port}`)).resolves.toBeUndefined();
  });

  test("throws for unreachable URL", async () => {
    await expect(checkBaseUrlReachable("http://127.0.0.1:19999")).rejects.toThrow();
  });

  test("throws on timeout", async () => {
    const server = Bun.serve({
      port: 0,
      async fetch() {
        // Hang for 10 seconds (longer than the test timeout)
        await Bun.sleep(10_000);
        return new Response("OK");
      },
    });
    servers.push(server);
    // Use a very short timeout (100ms) for test speed
    await expect(checkBaseUrlReachable(`http://localhost:${server.port}`, 100)).rejects.toThrow();
  });
});
