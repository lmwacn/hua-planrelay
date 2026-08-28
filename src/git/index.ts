import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_GIT_TIMEOUT_MS = 15_000;
export const DEFAULT_GIT_OUTPUT_BYTES = 10 * 1024 * 1024;
export const DEFAULT_PAGE_BYTES = 64 * 1024;
const MAX_PAGE_BYTES = 1024 * 1024;

export type GitInfo = {
  isRepo: boolean;
  root: string | null;
  branch: string | null;
  head: string | null;
};

export type GitStatusEntry = {
  path: string;
  index: string;
  worktree: string;
  originalPath?: string;
};

export type Page<T> = {
  items: T;
  nextCursor: string | null;
  hasMore: boolean;
};

export type TextPage = Page<string>;
export type DiffMode = "unstaged" | "staged" | "head";
export type DiffOptions = { mode?: DiffMode; path?: string; cursor?: string; maxBytes?: number };

export class GitCommandError extends Error {
  readonly command: string[];
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly timedOut: boolean;

  constructor(
    message: string,
    command: string[],
    options: { exitCode?: number | null; stderr?: string; timedOut?: boolean } = {},
  ) {
    super(message);
    this.name = "GitCommandError";
    this.command = command;
    this.exitCode = options.exitCode ?? null;
    this.stderr = options.stderr ?? "";
    this.timedOut = options.timedOut ?? false;
  }
}

type GitReaderOptions = {
  workspaceRoot: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  additionalDeniedPaths?: string[];
};

type CommandResult = { stdout: string; stderr: string; exitCode: number };

/**
 * Built-in deny rules intentionally err on the side of not returning secrets.
 * The policy is applied to every path returned by git, including untracked files.
 */
export function isSensitivePath(relativePath: string, additionalDeniedPaths: string[] = []): boolean {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\.\/+/, "");
  const components = normalized.split("/").filter(Boolean).map((part) => part.toLowerCase());
  const basename = components.at(-1) ?? "";
  if (components.includes(".git") || components.some((part) => [".ssh", ".aws", ".kube", ".gnupg", ".docker"].includes(part))) {
    return true;
  }
  if (
    basename === ".env" ||
    basename.startsWith(".env.") ||
    [".npmrc", ".netrc", "credentials", "credential", "cookies", "cookies.sqlite"].includes(basename) ||
    basename.startsWith("id_rsa") ||
    basename.startsWith("id_ed25519") ||
    basename.startsWith("service-account") ||
    basename.endsWith(".tfstate") ||
    basename.endsWith(".tfstate.backup") ||
    /\.(pem|key|p12|pfx|kdbx)$/i.test(basename)
  ) {
    return true;
  }
  return additionalDeniedPaths.some((pattern) => matchesSimpleGlob(normalized, pattern));
}

function matchesSimpleGlob(value: string, pattern: string): boolean {
  const normalized = pattern.replaceAll("\\", "/").replace(/^\.\/+/, "");
  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("**", "§§").replaceAll("*", "[^/]*").replaceAll("§§", ".*").replaceAll("?", "[^/]");
  return new RegExp(`^${escaped}$`, "i").test(value);
}

/** Split only at line boundaries and never split a UTF-8 sequence or surrogate pair. */
export function paginateLines(text: string, cursor = "0", maxBytes = DEFAULT_PAGE_BYTES): TextPage {
  const budget = Math.min(Math.max(1, Math.floor(maxBytes)), MAX_PAGE_BYTES);
  const start = parseCursor(cursor);
  const lines = text.match(/.*(?:\n|$)/gu)?.filter((line, index, all) => !(line === "" && index === all.length - 1)) ?? [];
  let bytes = 0;
  let end = start;
  while (end < lines.length) {
    const lineBytes = Buffer.byteLength(lines[end], "utf8");
    // An individual long line is kept intact: a byte budget must not turn into a
    // corrupt partial line. The next page starts after that line.
    if (end > start && bytes + lineBytes > budget) break;
    bytes += lineBytes;
    end += 1;
    if (bytes >= budget) break;
  }
  return { items: lines.slice(start, end).join(""), nextCursor: end < lines.length ? String(end) : null, hasMore: end < lines.length };
}

function parseCursor(cursor: string): number {
  if (!/^\d+$/.test(cursor)) throw new Error("cursor must be a non-negative line offset");
  return Number(cursor);
}

export class GitReader {
  workspaceRoot: string;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly additionalDeniedPaths: string[];
  private readonly ready: Promise<void>;

  constructor(options: GitReaderOptions) {
    this.workspaceRoot = path.resolve(options.workspaceRoot);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS;
    this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_GIT_OUTPUT_BYTES;
    this.additionalDeniedPaths = options.additionalDeniedPaths ?? [];
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    this.workspaceRoot = await realpath(this.workspaceRoot);
  }

  private async run(args: string[], options: { allowFailure?: boolean } = {}): Promise<CommandResult> {
    await this.ready;
    return runGit(this.workspaceRoot, args, { timeoutMs: this.timeoutMs, maxOutputBytes: this.maxOutputBytes, ...options });
  }

  async info(): Promise<GitInfo> {
    await this.ready;
    try {
      const rootResult = await this.run(["rev-parse", "--show-toplevel"]);
      const root = (await realpath(rootResult.stdout.trim())).replaceAll(path.sep, "/");
      const [branchResult, headResult] = await Promise.all([
        this.run(["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true }),
        this.run(["rev-parse", "--verify", "HEAD"], { allowFailure: true }),
      ]);
      return {
        isRepo: true,
        root,
        branch: branchResult.exitCode === 0 ? branchResult.stdout.trim() || null : null,
        head: headResult.exitCode === 0 ? headResult.stdout.trim() || null : null,
      };
    } catch (error) {
      if (error instanceof GitCommandError && (error.exitCode === 128 || /not a git repository/i.test(error.stderr))) {
        return { isRepo: false, root: null, branch: null, head: null };
      }
      throw error;
    }
  }

  async status(cursor = "0", maxBytes = DEFAULT_PAGE_BYTES): Promise<Page<GitStatusEntry[]>> {
    const result = await this.run(["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "."]);
    const records = parseStatus(result.stdout).filter((entry) => this.isAllowed(entry.path) && (!entry.originalPath || this.isAllowed(entry.originalPath)));
    const page = paginateItems(records, cursor, maxBytes, (entry) => JSON.stringify(entry));
    return { items: page.items, nextCursor: page.nextCursor, hasMore: page.hasMore };
  }

  async diff(cursorOrOptions: string | DiffOptions = "0", maxBytes = DEFAULT_PAGE_BYTES, options: DiffOptions = {}): Promise<TextPage> {
    // Keep the original (cursor, maxBytes) signature while allowing callers to
    // select staged/HEAD diffs and a safe relative subtree.
    const request = typeof cursorOrOptions === "string" ? options : cursorOrOptions;
    const cursor = typeof cursorOrOptions === "string" ? cursorOrOptions : (cursorOrOptions.cursor ?? "0");
    maxBytes = typeof cursorOrOptions === "string" ? maxBytes : (cursorOrOptions.maxBytes ?? DEFAULT_PAGE_BYTES);
    const mode = request.mode ?? "unstaged";
    const scope = request.path === undefined ? "." : await this.assertGitPath(request.path);
    const modeArgs = mode === "staged" ? ["--cached"] : mode === "head" ? ["HEAD"] : [];
    const nameResult = await this.run(["diff", ...modeArgs, "--name-only", "-z", "--", scope]);
    const names = nameResult.stdout.split("\0").filter(Boolean).filter((name) => this.isAllowed(name));
    if (names.length === 0) return { items: "", nextCursor: null, hasMore: false };
    const chunks: string[] = [];
    let args: string[] = ["diff", ...modeArgs, "--no-ext-diff", "--no-textconv", "--no-color", "--unified=3", "--"];
    let size = 0;
    for (const name of names) {
      const nameSize = Buffer.byteLength(name, "utf8") + 1;
      if (args.length > 2 && size + nameSize > 100_000) {
        chunks.push((await this.run(args)).stdout);
        args = ["diff", ...modeArgs, "--no-ext-diff", "--no-textconv", "--no-color", "--unified=3", "--"];
        size = 0;
      }
      args.push(name);
      size += nameSize;
    }
    if (args.length > 2) chunks.push((await this.run(args)).stdout);
    return paginateLines(chunks.join(""), cursor, maxBytes);
  }

  /** Validates a user-supplied path without ever returning an outside path. */
  async assertWorkspacePath(relativePath: string): Promise<string> {
    await this.ready;
    if (!relativePath || relativePath.includes("\0") || path.isAbsolute(relativePath)) throw new Error("path must be a non-empty relative workspace path");
    const candidate = path.resolve(this.workspaceRoot, relativePath);
    if (!isWithin(this.workspaceRoot, candidate) || isSensitivePath(relativePath, this.additionalDeniedPaths)) throw new Error("path is outside the workspace or denied");
    let resolved: string;
    try {
      resolved = await realpath(candidate);
    } catch {
      throw new Error("path does not exist");
    }
    if (!isWithin(this.workspaceRoot, resolved)) throw new Error("path escapes the workspace through a symlink");
    return resolved;
  }

  private async assertGitPath(relativePath: string): Promise<string> {
    await this.ready;
    if (!relativePath || relativePath.includes("\0") || path.isAbsolute(relativePath)) throw new Error("path must be a non-empty relative workspace path");
    const candidate = path.resolve(this.workspaceRoot, relativePath);
    if (!isWithin(this.workspaceRoot, candidate) || isSensitivePath(relativePath, this.additionalDeniedPaths)) throw new Error("path is outside the workspace or denied");
    // A deleted path is valid for diff, so realpath only existing components.
    let current = candidate;
    while (isWithin(this.workspaceRoot, current)) {
      try {
        const resolved = await realpath(current);
        if (!isWithin(this.workspaceRoot, resolved)) throw new Error("path escapes the workspace through a symlink");
        break;
      } catch (error) {
        if (error instanceof Error && error.message.includes("escapes")) throw error;
        const parent = path.dirname(current);
        if (parent === current) throw new Error("path does not belong to the workspace");
        current = parent;
      }
    }
    return path.relative(this.workspaceRoot, candidate).replaceAll(path.sep, "/") || ".";
  }

  private isAllowed(relativePath: string): boolean {
    const normalized = relativePath.replaceAll("\\", "/");
    return !isSensitivePath(normalized, this.additionalDeniedPaths) && !normalized.startsWith("../") && normalized !== "..";
  }
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function runGit(cwd: string, args: string[], options: { timeoutMs: number; maxOutputBytes: number; allowFailure?: boolean }): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", cwd, ...args], { cwd, shell: false, windowsHide: true });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let total = 0;
    let timedOut = false;
    let tooLarge = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 250).unref();
    }, options.timeoutMs);
    const collect = (target: Buffer[], chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > options.maxOutputBytes) {
        tooLarge = true;
        child.kill("SIGTERM");
      } else target.push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      const output = { stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8"), exitCode: code ?? -1 };
      if (timedOut) return reject(new GitCommandError("git command timed out", args, { stderr: output.stderr, timedOut: true }));
      if (tooLarge) return reject(new GitCommandError("git command output exceeded the configured limit", args, { stderr: output.stderr }));
      if (output.exitCode !== 0 && !options.allowFailure) return reject(new GitCommandError(`git command failed (${output.exitCode})`, args, { exitCode: output.exitCode, stderr: output.stderr }));
      resolve(output);
    });
  });
}

function parseStatus(raw: string): GitStatusEntry[] {
  const records = raw.split("\0").filter(Boolean);
  const result: GitStatusEntry[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.length < 4) continue;
    const status = record.slice(0, 2);
    const entry: GitStatusEntry = { index: status[0], worktree: status[1], path: record.slice(3) };
    if (status.includes("R") || status.includes("C")) entry.originalPath = records[++index];
    result.push(entry);
  }
  return result;
}

function paginateItems<T>(items: T[], cursor: string, maxBytes: number, serialize: (item: T) => string): Page<T[]> {
  const start = parseCursor(cursor);
  const budget = Math.min(Math.max(1, Math.floor(maxBytes)), MAX_PAGE_BYTES);
  let bytes = 0;
  let end = start;
  while (end < items.length) {
    const itemBytes = Buffer.byteLength(serialize(items[end]), "utf8") + 1;
    if (end > start && bytes + itemBytes > budget) break;
    bytes += itemBytes;
    end += 1;
    if (bytes >= budget) break;
  }
  return { items: items.slice(start, end), nextCursor: end < items.length ? String(end) : null, hasMore: end < items.length };
}

export default GitReader;
