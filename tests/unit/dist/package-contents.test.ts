import { beforeAll, describe, expect, test } from "bun:test";

const ROOT = `${import.meta.dir}/../../..`;

describe("package contents", () => {
  let pkg: any;

  beforeAll(async () => {
    pkg = await Bun.file(`${ROOT}/package.json`).json();
  });

  describe("package.json required fields", () => {
    test("name is 'superghost'", () => {
      expect(pkg.name).toBe("superghost");
    });

    test("version is '0.3.0'", () => {
      expect(pkg.version).toBe("0.3.0");
    });

    test("has description", () => {
      expect(pkg.description).toBe(
        "Plain English test cases with AI execution and instant cached replay for CI/CD",
      );
    });

    test("type is 'module'", () => {
      expect(pkg.type).toBe("module");
    });

    test("bin.superghost points to src/cli.ts", () => {
      expect(pkg.bin.superghost).toBe("src/cli.ts");
    });

    test("files array contains exactly ['src/', 'README.md', 'LICENSE']", () => {
      expect(pkg.files).toEqual(["src/", "README.md", "LICENSE"]);
    });

    test("publishConfig.access is 'public'", () => {
      expect(pkg.publishConfig.access).toBe("public");
    });

    test("engines.bun is '>=1.2.0'", () => {
      expect(pkg.engines.bun).toBe(">=1.2.0");
    });

    test("has keywords array", () => {
      expect(pkg.keywords).toBeArray();
      expect(pkg.keywords.length).toBeGreaterThan(0);
    });
  });

  describe("bun pm pack --dry-run", () => {
    test("tarball includes src/ files and README.md", async () => {
      const proc = Bun.spawn(["bun", "pm", "pack", "--dry-run"], {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = await new Response(proc.stdout).text();
      await proc.exited;

      // Should include src/ files
      expect(output).toContain("src/");
      // Should include README.md
      expect(output).toContain("README.md");
      // Should include package.json
      expect(output).toContain("package.json");
    });

    test("tarball excludes internal directories", async () => {
      const proc = Bun.spawn(["bun", "pm", "pack", "--dry-run"], {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = await new Response(proc.stdout).text();
      await proc.exited;

      // Should NOT include these directories
      const excluded = [
        "tests/",
        ".planning/",
        ".superghost-cache/",
        "references/",
        ".github/",
        "docs/",
        "scripts/",
      ];

      for (const dir of excluded) {
        expect(output).not.toContain(dir);
      }
    });
  });
});
