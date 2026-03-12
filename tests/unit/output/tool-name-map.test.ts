import { describe, expect, it } from "bun:test";
import { describeToolCall } from "../../../src/output/tool-name-map.ts";

describe("describeToolCall", () => {
  it("maps browser_navigate with url key arg", () => {
    const result = describeToolCall("browser_navigate", { url: "/login" });
    expect(result).toEqual({
      action: "Navigate",
      keyArg: "/login",
      full: "Navigate \u2192 /login",
    });
  });

  it("maps browser_click with element key arg", () => {
    const result = describeToolCall("browser_click", {
      element: "button.submit",
    });
    expect(result).toEqual({
      action: "Click",
      keyArg: "button.submit",
      full: "Click \u2192 button.submit",
    });
  });

  it("maps browser_type with element key arg", () => {
    const result = describeToolCall("browser_type", {
      element: "#username",
      text: "admin",
    });
    expect(result).toEqual({
      action: "Type",
      keyArg: "#username",
      full: "Type \u2192 #username",
    });
  });

  it("maps browser_screenshot with no key arg", () => {
    const result = describeToolCall("browser_screenshot", {});
    expect(result).toEqual({
      action: "Screenshot",
      keyArg: undefined,
      full: "Screenshot",
    });
  });

  it("falls back to capitalized name for unknown tools", () => {
    const result = describeToolCall("unknown_tool", { foo: "bar" });
    expect(result).toEqual({
      action: "Unknown tool",
      keyArg: undefined,
      full: "Unknown tool",
    });
  });

  it("maps browser_wait_for_text with text key arg", () => {
    const result = describeToolCall("browser_wait_for_text", {
      text: "Welcome",
    });
    expect(result).toEqual({
      action: "Wait for text",
      keyArg: "Welcome",
      full: "Wait for text \u2192 Welcome",
    });
  });

  it("maps browser_press_key with key key arg", () => {
    const result = describeToolCall("browser_press_key", { key: "Enter" });
    expect(result).toEqual({
      action: "Press key",
      keyArg: "Enter",
      full: "Press key \u2192 Enter",
    });
  });

  it("maps browser_hover with element key arg", () => {
    const result = describeToolCall("browser_hover", { element: "#menu" });
    expect(result).toEqual({
      action: "Hover",
      keyArg: "#menu",
      full: "Hover \u2192 #menu",
    });
  });

  it("maps browser_select_option with element key arg", () => {
    const result = describeToolCall("browser_select_option", {
      element: "#country",
    });
    expect(result).toEqual({
      action: "Select",
      keyArg: "#country",
      full: "Select \u2192 #country",
    });
  });

  it("maps tools without key args to action-only description", () => {
    const result = describeToolCall("browser_go_back", {});
    expect(result).toEqual({
      action: "Go back",
      keyArg: undefined,
      full: "Go back",
    });
  });

  it("handles missing key arg field gracefully", () => {
    // browser_navigate expects "url" but it's not provided
    const result = describeToolCall("browser_navigate", {});
    expect(result).toEqual({
      action: "Navigate",
      keyArg: undefined,
      full: "Navigate",
    });
  });
});
