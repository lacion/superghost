import { describe, expect, test } from "bun:test";

import { escapeXml, stripAnsi } from "../../../src/output/xml-utils.ts";

describe("escapeXml", () => {
  test("returns string unchanged when no special chars", () => {
    expect(escapeXml("hello")).toBe("hello");
  });

  test("escapes ampersand", () => {
    expect(escapeXml("a & b")).toBe("a &amp; b");
  });

  test("escapes angle brackets", () => {
    expect(escapeXml("<script>")).toBe("&lt;script&gt;");
  });

  test("escapes double quotes", () => {
    expect(escapeXml('say "hi"')).toBe("say &quot;hi&quot;");
  });

  test("escapes single quotes (apostrophe)", () => {
    expect(escapeXml("it's")).toBe("it&apos;s");
  });

  test("escapes all 5 XML-special characters in one string", () => {
    expect(escapeXml("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
  });

  test("does not double-escape already-escaped entities", () => {
    // escapeXml should escape once — if input has &amp; the & gets escaped again
    expect(escapeXml("&amp;")).toBe("&amp;amp;");
  });
});

describe("stripAnsi", () => {
  test("strips simple ANSI color code", () => {
    expect(stripAnsi("\x1b[31mred\x1b[0m")).toBe("red");
  });

  test("strips nested ANSI sequences", () => {
    expect(stripAnsi("\x1b[1m\x1b[33mwarn\x1b[0m")).toBe("warn");
  });

  test("returns plain text unchanged", () => {
    expect(stripAnsi("no ansi here")).toBe("no ansi here");
  });

  test("returns empty string unchanged", () => {
    expect(stripAnsi("")).toBe("");
  });
});
