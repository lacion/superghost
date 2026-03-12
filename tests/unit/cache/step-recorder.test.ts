import { describe, expect, test } from "bun:test";

import { StepRecorder } from "../../../src/cache/step-recorder.ts";

describe("StepRecorder", () => {
  test("getSteps() returns empty array initially", () => {
    const recorder = new StepRecorder();
    expect(recorder.getSteps()).toEqual([]);
  });

  test("record() appends a step", () => {
    const recorder = new StepRecorder();
    recorder.record("browser_navigate", { url: "http://localhost:3000" });

    const steps = recorder.getSteps();
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual({
      toolName: "browser_navigate",
      toolInput: { url: "http://localhost:3000" },
    });
  });

  test("record() appends multiple steps in order", () => {
    const recorder = new StepRecorder();
    recorder.record("browser_navigate", { url: "http://localhost:3000" });
    recorder.record("browser_click", { selector: "#login" });

    const steps = recorder.getSteps();
    expect(steps).toHaveLength(2);
    expect(steps[0]?.toolName).toBe("browser_navigate");
    expect(steps[1]?.toolName).toBe("browser_click");
  });

  test("getSteps() returns a copy (modifying returned array does not affect internal state)", () => {
    const recorder = new StepRecorder();
    recorder.record("browser_navigate", { url: "http://localhost:3000" });

    const steps = recorder.getSteps();
    steps.push({ toolName: "fake_tool", toolInput: {} });

    expect(recorder.getSteps()).toHaveLength(1);
  });

  test("clear() empties the steps array", () => {
    const recorder = new StepRecorder();
    recorder.record("browser_navigate", { url: "http://localhost:3000" });
    recorder.record("browser_click", { selector: "#login" });

    recorder.clear();
    expect(recorder.getSteps()).toEqual([]);
  });

  describe("wrapTools", () => {
    test("calls original execute and records step on success", async () => {
      const recorder = new StepRecorder();
      const calls: Array<Record<string, unknown>> = [];

      const tools = {
        browser_navigate: {
          description: "Navigate to URL",
          execute: async (input: Record<string, unknown>) => {
            calls.push(input);
            return "Navigated to page";
          },
        },
      };

      const wrapped = recorder.wrapTools(tools);
      const result = await wrapped.browser_navigate.execute({
        url: "http://localhost:3000",
      });

      // Original was called
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ url: "http://localhost:3000" });

      // Result was returned
      expect(result).toBe("Navigated to page");

      // Step was recorded
      const steps = recorder.getSteps();
      expect(steps).toHaveLength(1);
      expect(steps[0]).toEqual({
        toolName: "browser_navigate",
        toolInput: { url: "http://localhost:3000" },
      });
    });

    test("does not record step when execute throws", async () => {
      const recorder = new StepRecorder();

      const tools = {
        browser_click: {
          description: "Click element",
          execute: async (_input: Record<string, unknown>) => {
            throw new Error("Element not found");
          },
        },
      };

      const wrapped = recorder.wrapTools(tools);

      await expect(wrapped.browser_click.execute({ selector: "#missing" })).rejects.toThrow("Element not found");

      // Step was NOT recorded
      expect(recorder.getSteps()).toEqual([]);
    });

    test("wraps multiple tools", async () => {
      const recorder = new StepRecorder();

      const tools = {
        browser_navigate: {
          description: "Navigate",
          execute: async (_input: Record<string, unknown>) => "done",
        },
        browser_click: {
          description: "Click",
          execute: async (_input: Record<string, unknown>) => "clicked",
        },
      };

      const wrapped = recorder.wrapTools(tools);
      await wrapped.browser_navigate.execute({ url: "http://localhost" });
      await wrapped.browser_click.execute({ selector: "#btn" });

      expect(recorder.getSteps()).toHaveLength(2);
      expect(recorder.getSteps()[0]?.toolName).toBe("browser_navigate");
      expect(recorder.getSteps()[1]?.toolName).toBe("browser_click");
    });
  });
});
