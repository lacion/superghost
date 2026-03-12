import { describe, expect, test } from "bun:test";

import { StepReplayer } from "../../../src/cache/step-replayer.ts";
import { type CachedStep } from "../../../src/cache/types.ts";

describe("StepReplayer", () => {
  test("replay() with all-successful steps returns { success: true }", async () => {
    const executor = async (_name: string, _input: Record<string, unknown>) => "ok";
    const replayer = new StepReplayer(executor);

    const steps: CachedStep[] = [
      { toolName: "browser_navigate", toolInput: { url: "http://localhost" } },
      { toolName: "browser_click", toolInput: { selector: "#btn" } },
    ];

    const result = await replayer.replay(steps);
    expect(result).toEqual({ success: true });
  });

  test("replay() calls executor with correct toolName and toolInput in order", async () => {
    const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
    const executor = async (name: string, input: Record<string, unknown>) => {
      calls.push({ name, input });
      return "ok";
    };
    const replayer = new StepReplayer(executor);

    const steps: CachedStep[] = [
      { toolName: "browser_navigate", toolInput: { url: "http://localhost" } },
      { toolName: "browser_click", toolInput: { selector: "#login" } },
      { toolName: "browser_type", toolInput: { text: "admin" } },
    ];

    await replayer.replay(steps);

    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual({
      name: "browser_navigate",
      input: { url: "http://localhost" },
    });
    expect(calls[1]).toEqual({
      name: "browser_click",
      input: { selector: "#login" },
    });
    expect(calls[2]).toEqual({
      name: "browser_type",
      input: { text: "admin" },
    });
  });

  test("replay() stops on first failure and returns failure result", async () => {
    const calls: string[] = [];
    const executor = async (name: string, _input: Record<string, unknown>) => {
      calls.push(name);
      if (name === "browser_click") {
        throw new Error("Element not found");
      }
      return "ok";
    };
    const replayer = new StepReplayer(executor);

    const steps: CachedStep[] = [
      { toolName: "browser_navigate", toolInput: { url: "http://localhost" } },
      { toolName: "browser_click", toolInput: { selector: "#missing" } },
      { toolName: "browser_type", toolInput: { text: "should not run" } },
    ];

    const result = await replayer.replay(steps);

    expect(result.success).toBe(false);
    expect(result.failedStep).toBe(1);
    expect(result.error).toBe("Element not found");

    // Third step should NOT have been called
    expect(calls).toHaveLength(2);
    expect(calls).not.toContain("browser_type");
  });

  test("replay() with empty steps returns { success: true }", async () => {
    const executor = async (_name: string, _input: Record<string, unknown>) => "ok";
    const replayer = new StepReplayer(executor);

    const result = await replayer.replay([]);
    expect(result).toEqual({ success: true });
  });
});
