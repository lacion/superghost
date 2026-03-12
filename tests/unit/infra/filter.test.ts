import { describe, expect, it } from "bun:test";
import picomatch from "picomatch";

describe("picomatch glob filter behavior", () => {
  const testNames = ["Login Flow", "Login Error", "Dashboard Load", "Checkout Process"];

  function filterTests(pattern: string): string[] {
    const isMatch = picomatch(pattern, { nocase: true });
    return testNames.filter((name) => isMatch(name));
  }

  it("case-insensitive match: 'login*' matches 'Login Flow' and 'Login Error'", () => {
    const result = filterTests("login*");
    expect(result).toEqual(["Login Flow", "Login Error"]);
  });

  it("glob alternation: '{login,dash}*' matches Login and Dashboard tests", () => {
    const result = filterTests("{login,dash}*");
    expect(result).toContain("Login Flow");
    expect(result).toContain("Login Error");
    expect(result).toContain("Dashboard Load");
    expect(result).not.toContain("Checkout Process");
  });

  it("no-match pattern returns empty array", () => {
    const result = filterTests("nonexistent*");
    expect(result).toEqual([]);
  });

  it("exact match works", () => {
    const result = filterTests("Login Flow");
    expect(result).toEqual(["Login Flow"]);
  });

  it("wildcard '*' matches all tests", () => {
    const result = filterTests("*");
    expect(result).toEqual(testNames);
  });
});
