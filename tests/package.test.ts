import { execFile } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const execFileAsync = promisify(execFile);

describe("published plugin package", () => {
  it("has a valid local plugin manifest and MCP entry point", async () => {
    const manifest = JSON.parse(await readFile(path.join(root, ".codex-plugin", "plugin.json"), "utf8"));
    const mcp = JSON.parse(await readFile(path.join(root, ".mcp.json"), "utf8"));

    expect(manifest).toMatchObject({
      name: "hua-planrelay",
      version: "0.1.1",
      license: "MIT",
      skills: "./skills/",
      mcpServers: "./.mcp.json",
    });
    expect(manifest.interface.privacyPolicyURL).toMatch(/^https:\/\/github\.com\/lmwacn\/hua-planrelay\//);
    expect(mcp.mcpServers["hua-planrelay"]).toEqual({
      command: "node",
      args: ["${PLUGIN_ROOT}/dist/hua-planrelay.mjs", "serve", "--transport", "stdio"],
    });
    await access(path.join(root, manifest.interface.logo));
    await access(path.join(root, "skills", "hua-planrelay", "SKILL.md"));
  });

  it("ships the standalone entry points required by a GitHub install", async () => {
    const bundle = path.join(root, "dist", "hua-planrelay.mjs");
    const bin = path.join(root, "bin", "hua-planrelay.js");
    await access(bundle);
    expect((await stat(bin)).mode & 0o111).not.toBe(0);
    for (const entry of [bundle, bin]) {
      const { stdout } = await execFileAsync(process.execPath, [entry, "--help"], { cwd: root, timeout: 10_000 });
      expect(stdout).toContain("Hua PlanRelay");
      expect(stdout).toContain("serve");
    }
  });
});
