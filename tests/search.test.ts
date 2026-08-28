import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Workspace } from "../src/workspace/index.js";

const roots: string[] = [];
afterEach(() => { roots.length = 0; });

async function searchFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "planrelay-search-"));
  roots.push(root);
  await writeFile(join(root, "a.ts"), "Alpha\nalpha again\n", "utf8");
  await writeFile(join(root, "b.txt"), "nothing here\n", "utf8");
  await writeFile(join(root, ".env"), "Alpha=secret\n", "utf8");
  await writeFile(join(root, "binary.bin"), Buffer.from([0, 1, 2, 3]), "binary");
  await writeFile(join(root, "large.ts"), "a\n".repeat(100_000), "utf8");
  return root;
}

describe("Workspace safe text search", () => {
  it("searches only allowed text files and honors result limits", async () => {
    const root = await searchFixture();
    const workspace = new Workspace({ root, trackedFilesOnly: false });
    const result = await workspace.searchText("alpha", { caseSensitive: false, maxResults: 1 });
    expect(result.engine).toBe("node");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ path: "a.ts", line: 1, column: 1 });
    expect(result.truncated).toBe(true);
  });

  it("rejects regular expressions because they cannot be interrupted safely", async () => {
    const root = await searchFixture();
    const workspace = new Workspace({ root, trackedFilesOnly: false });
    await expect(workspace.searchText("^alpha", { regex: true, caseSensitive: false })).rejects.toMatchObject({ code: "UNSAFE_REGEX" });
    await expect(workspace.searchText("(a+)+$", { regex: true })).rejects.toMatchObject({ code: "UNSAFE_REGEX" });
  });

  it("bounds excerpts and aggregate output for repeated matches on a long line", async () => {
    const root = await searchFixture();
    await writeFile(join(root, "repeated.txt"), "needle".repeat(100_000), "utf8");
    const workspace = new Workspace({ root, trackedFilesOnly: false });
    const result = await workspace.searchText("needle", { maxResults: 1_000_000 });
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThan(140 * 1024);
    expect(result.matches.every((match) => match.text.length < 1_100)).toBe(true);
  });

  it("rejects binary files through the text API", async () => {
    const root = await searchFixture();
    const workspace = new Workspace({ root, trackedFilesOnly: false });
    await expect(workspace.readFile("binary.bin")).rejects.toMatchObject({ code: "BINARY_FILE" });
    await expect(workspace.searchText("x", { path: "binary.bin" })).rejects.toMatchObject({ code: "BINARY_FILE" });
  });

  it("enforces the file-size and timeout limits", async () => {
    const root = await searchFixture();
    const workspace = new Workspace({ root, trackedFilesOnly: false });
    const skipped = await workspace.searchText("Alpha", { maxFileBytes: 1 });
    expect(skipped.matches).toHaveLength(0);
    await expect(workspace.searchText("a", { timeoutMs: 1 })).rejects.toMatchObject({ code: "SEARCH_TIMEOUT" });
  });
});
