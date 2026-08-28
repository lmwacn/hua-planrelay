import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { Workspace, WorkspaceError } from "../src/workspace/index.js";

const exec = promisify(execFile);
const roots: string[] = [];

async function fixture(git = false): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "planrelay-workspace-"));
  roots.push(root);
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "main.ts"), "const answer = 42;\nsecond line\n", "utf8");
  await writeFile(join(root, "notes.txt"), "not tracked\n", "utf8");
  await writeFile(join(root, ".env"), "TOKEN=do-not-read\n", "utf8");
  if (git) {
    await exec("git", ["init", "-q"], { cwd: root });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await exec("git", ["config", "user.name", "PlanRelay Test"], { cwd: root });
    await exec("git", ["add", "src/main.ts"], { cwd: root });
    await exec("git", ["commit", "-qm", "fixture"], { cwd: root });
  }
  return root;
}

afterEach(async () => {
  // Temporary directories are left to the OS; the test itself never deletes
  // user data outside its private mkdtemp directory.
  roots.length = 0;
});

describe("Workspace path and disclosure boundary", () => {
  it("rejects traversal, absolute paths, backslashes and NUL", async () => {
    const root = await fixture(true);
    const workspace = new Workspace({ root });
    for (const input of ["../outside", "/etc/passwd", "C:/Windows", "src\\main.ts", "src//main.ts", "src/\0x"]) {
      await expect(workspace.readFile(input)).rejects.toBeInstanceOf(WorkspaceError);
    }
  });

  it("never follows a symlink outside the workspace", async () => {
    const root = await fixture(false);
    const outside = await mkdtemp(join(tmpdir(), "planrelay-outside-"));
    await writeFile(join(outside, "secret.txt"), "private\n", "utf8");
    await symlink(join(outside, "secret.txt"), join(root, "src", "link.txt"));
    const workspace = new Workspace({ root, trackedFilesOnly: false });
    await expect(workspace.readFile("src/link.txt")).rejects.toMatchObject({ code: "PATH_DENIED" });
    const page = await workspace.listDirectory("src");
    expect(page.entries.some((entry) => entry.name === "link.txt")).toBe(false);
  });

  it("keeps built-in sensitive paths denied even when ignore rules negate", async () => {
    const root = await fixture(false);
    await writeFile(join(root, ".planrelayignore"), "!.env\n", "utf8");
    const workspace = new Workspace({ root, trackedFilesOnly: false });
    await expect(workspace.readFile(".env")).rejects.toMatchObject({ code: "PATH_DENIED" });
  });

  it("keeps VCS metadata denied when untracked reads are enabled", async () => {
    const root = await fixture(true);
    const workspace = new Workspace({ root, trackedFilesOnly: false });
    expect((await workspace.listDirectory("")).entries.map((entry) => entry.name)).not.toContain(".git");
    await expect(workspace.readFile(".git/config")).rejects.toMatchObject({ code: "PATH_DENIED" });
    expect((await workspace.searchText("repositoryformatversion")).matches).toHaveLength(0);
  });

  it("defaults to tracked files and can be explicitly widened", async () => {
    const root = await fixture(true);
    const tracked = new Workspace({ root });
    const trackedPage = await tracked.listDirectory("");
    expect(trackedPage.entries.map((entry) => entry.name)).toContain("src");
    expect(trackedPage.entries.map((entry) => entry.name)).not.toContain("notes.txt");
    const all = new Workspace({ root, trackedFilesOnly: false });
    expect((await all.listDirectory("")).entries.map((entry) => entry.name)).toContain("notes.txt");
  });

  it("paginates directories and reads bounded line ranges", async () => {
    const root = await fixture(false);
    const workspace = new Workspace({ root, trackedFilesOnly: false });
    const first = await workspace.listDirectory("src", { limit: 1 });
    expect(first.hasMore).toBe(false);
    const content = await workspace.readFile("src/main.ts", { startLine: 2, endLine: 2, maxLines: 1 });
    expect(content.content).toBe("second line");
    expect(content.startLine).toBe(2);
    await expect(workspace.readFile("src/main.ts", { maxBytes: 2 })).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  });
});
