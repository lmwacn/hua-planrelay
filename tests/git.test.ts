import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GitReader, isSensitivePath, paginateLines } from "../src/git/index.js";

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

async function repo(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hua-planrelay-git-"));
  temporary.push(dir);
  execFileSync("git", ["init", "-q", dir]);
  await writeFile(path.join(dir, "README.md"), "hello\n");
  await writeFile(path.join(dir, ".env"), "TOKEN=do-not-return\n");
  execFileSync("git", ["-C", dir, "add", "."]);
  execFileSync("git", ["-C", dir, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial"]);
  return dir;
}

describe("GitReader", () => {
  it("identifies non-repositories without treating git's error as a repository", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "hua-planrelay-not-git-"));
    temporary.push(dir);
    await expect(new GitReader({ workspaceRoot: dir }).info()).resolves.toEqual({ isRepo: false, root: null, branch: null, head: null });
  });

  it("limits status and diff to safe paths", async () => {
    const dir = await repo();
    await writeFile(path.join(dir, "README.md"), "你好 🌏\nchanged\n");
    await writeFile(path.join(dir, ".env.local"), "SECRET=never\n");
    const git = new GitReader({ workspaceRoot: dir });
    const status = await git.status();
    expect(status.items.map((item) => item.path)).toEqual(["README.md"]);
    const diff = await git.diff();
    expect(diff.items).toContain("你好 🌏");
    expect(diff.items).not.toContain("SECRET=never");
  });

  it("rejects symlink escapes and sensitive paths", async () => {
    const dir = await repo();
    const outside = await mkdtemp(path.join(os.tmpdir(), "hua-planrelay-outside-"));
    temporary.push(outside);
    await writeFile(path.join(outside, "secret.txt"), "secret");
    await symlink(path.join(outside, "secret.txt"), path.join(dir, "link.txt"));
    const git = new GitReader({ workspaceRoot: dir });
    await expect(git.assertWorkspacePath("link.txt")).rejects.toThrow(/escapes|outside/);
    expect(isSensitivePath("config/.aws/credentials")).toBe(true);
    expect(isSensitivePath("src/main.ts")).toBe(false);
  });

  it("paginates by complete lines without splitting multibyte text", () => {
    const page = paginateLines("第一行 🌏\n第二行\n", "0", Buffer.byteLength("第一行 🌏\n", "utf8"));
    expect(page.items).toBe("第一行 🌏\n");
    expect(page.nextCursor).toBe("1");
    expect(paginateLines("超长行", "0", 1).items).toBe("超长行");
  });

  it("supports unstaged, staged, and HEAD diffs with a safe relative path", async () => {
    const dir = await repo();
    await writeFile(path.join(dir, "README.md"), "unstaged\n");
    const git = new GitReader({ workspaceRoot: dir });
    expect((await git.diff("0", 64 * 1024, { mode: "unstaged", path: "README.md" })).items).toContain("unstaged");
    execFileSync("git", ["-C", dir, "add", "README.md"]);
    expect((await git.diff("0", 64 * 1024, { mode: "staged", path: "README.md" })).items).toContain("unstaged");
    expect((await git.diff("0", 64 * 1024, { mode: "head", path: "README.md" })).items).toContain("unstaged");
    await expect(git.diff("0", 64 * 1024, { path: "../README.md" })).rejects.toThrow(/outside/);
  });
});
