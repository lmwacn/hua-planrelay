import { execFile } from "node:child_process";
import * as fsSync from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep, win32 } from "node:path";
import { promisify } from "node:util";
import ignore, { type Ignore } from "ignore";
import { deniedPath, invalidPath, WorkspaceError } from "./errors.js";
import type {
  DirectoryEntry,
  DirectoryPage,
  ReadFileOptions,
  ReadFileResult,
  SearchMatch,
  SearchOptions,
  SearchResult,
  WorkspaceOptions,
} from "./types.js";

const execFileAsync = promisify(execFile);
const DEFAULTS = {
  maxReadBytes: 1024 * 1024,
  maxReadLines: 2000,
  maxSearchFiles: 500,
  maxSearchResults: 200,
  maxSearchFileBytes: 1024 * 1024,
  searchTimeoutMs: 2000,
} as const;
const MAX_PAGE_SIZE = 200;

// This list is intentionally conservative. The user ignore file can only add
// exclusions; it can never make one of these paths visible.
const SENSITIVE_NAMES = new Set([
  ".npmrc", ".netrc", ".git-credentials", ".dockerconfigjson",
  "credentials", "credentials.json", "service-account.json",
  "terraform.tfstate", "terraform.tfstate.backup",
  "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "id_xmss",
]);
const SENSITIVE_DIRS = new Set([".git", ".hg", ".svn", ".ssh", ".aws", ".kube", ".docker", ".gnupg"]);

function normalizedRelative(value: string): string {
  if (typeof value !== "string") invalidPath("路径必须是字符串");
  if (value.length === 0 || value === ".") return "";
  if (value.includes("\0")) invalidPath("路径不能包含 NUL 字符");
  if (value.includes("\\")) invalidPath("路径必须使用正斜杠，禁止反斜杠");
  if (value.startsWith("/") || value.startsWith("//") || isAbsolute(value) || win32.isAbsolute(value) || /^[a-zA-Z]:/.test(value)) {
    invalidPath("只允许工作区内的相对路径");
  }
  const parts = value.split("/");
  if (parts.some((part) => part.length === 0)) invalidPath("路径不能包含重复的分隔符");
  if (parts.some((part) => part === "..")) invalidPath("路径不能包含 ..");
  if (parts.some((part) => part === ".")) invalidPath("路径不能包含 . 路径段");
  return parts.join("/");
}

function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function toPageCursor(index: number): string {
  return Buffer.from(String(index), "utf8").toString("base64url");
}

function fromPageCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const value = Number.parseInt(Buffer.from(cursor, "base64url").toString("utf8"), 10);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("bad cursor");
    return value;
  } catch {
    throw new WorkspaceError("INVALID_CURSOR", "无效的目录分页游标");
  }
}

function pathParts(relativePath: string): string[] {
  return relativePath ? relativePath.split("/") : [];
}

function isSensitive(relativePath: string): boolean {
  const parts = pathParts(relativePath);
  const lower = parts.map((part) => part.toLowerCase());
  if (lower.some((part) => SENSITIVE_DIRS.has(part))) return true;
  const base = lower.at(-1) ?? "";
  if (SENSITIVE_NAMES.has(base)) return true;
  if (base.startsWith(".env")) return true;
  if (/^(?:id_(?:rsa|dsa|ecdsa|ed25519|xmss))(?:\.pub)?$/.test(base)) return true;
  if (/\.(?:pem|key|p12|pfx|jks|kdbx|tfstate|tfstate\.backup)$/i.test(base)) return true;
  if (base === "config" && lower.some((part) => part === ".ssh" || part === ".kube")) return true;
  return false;
}

function ensurePositiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new WorkspaceError("INVALID_OPTION", `${name} 必须是正整数`);
  return value;
}

function isProbablyBinary(buffer: Buffer): boolean {
  // NUL is a reliable and intentionally conservative signal for source-file APIs.
  return buffer.subarray(0, Math.min(buffer.length, 8192)).includes(0);
}

function decodeText(buffer: Buffer): string {
  if (isProbablyBinary(buffer)) throw new WorkspaceError("BINARY_FILE", "二进制文件不能通过文本接口读取");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new WorkspaceError("BINARY_FILE", "文件不是有效的 UTF-8 文本");
  }
}

export class Workspace {
  readonly root: string;
  readonly trackedFilesOnly: boolean;
  private readonly options: Required<Pick<WorkspaceOptions, "maxReadBytes" | "maxReadLines" | "maxSearchFiles" | "maxSearchResults" | "maxSearchFileBytes" | "searchTimeoutMs">> & Pick<WorkspaceOptions, "ignoreFile">;
  private ignorePromise?: Promise<Ignore>;
  private trackedPromise?: Promise<Set<string>>;

  constructor(options: WorkspaceOptions) {
    if (!options || typeof options.root !== "string" || options.root.length === 0) throw new WorkspaceError("INVALID_ROOT", "必须提供工作区根目录");
    try {
      const root = requireRealpath(options.root);
      if (!isDirectorySync(root)) throw new Error("not directory");
      this.root = root;
    } catch {
      throw new WorkspaceError("INVALID_ROOT", "工作区根目录不存在或不是目录");
    }
    this.trackedFilesOnly = options.trackedFilesOnly ?? true;
    this.options = {
      maxReadBytes: options.maxReadBytes ?? DEFAULTS.maxReadBytes,
      maxReadLines: options.maxReadLines ?? DEFAULTS.maxReadLines,
      maxSearchFiles: options.maxSearchFiles ?? DEFAULTS.maxSearchFiles,
      maxSearchResults: options.maxSearchResults ?? DEFAULTS.maxSearchResults,
      maxSearchFileBytes: options.maxSearchFileBytes ?? DEFAULTS.maxSearchFileBytes,
      searchTimeoutMs: options.searchTimeoutMs ?? DEFAULTS.searchTimeoutMs,
      ignoreFile: options.ignoreFile,
    };
    for (const [name, value] of Object.entries(this.options)) {
      if (name !== "ignoreFile") ensurePositiveInteger(value as number, name);
    }
  }

  /** Canonical root, useful for displaying the authorization boundary. */
  info(): { root: string; trackedFilesOnly: boolean } {
    return { root: this.root, trackedFilesOnly: this.trackedFilesOnly };
  }

  private resolveRelative(input: string): { relative: string; absolute: string } {
    const rel = normalizedRelative(input);
    return { relative: rel, absolute: resolve(this.root, ...pathParts(rel)) };
  }

  private async existing(input: string): Promise<{ relative: string; absolute: string; real: string; info: Awaited<ReturnType<typeof lstat>> }> {
    const resolved = this.resolveRelative(input);
    let real: string;
    let info: Awaited<ReturnType<typeof lstat>>;
    try {
      real = await realpath(resolved.absolute);
      info = await lstat(real);
    } catch {
      throw new WorkspaceError("NOT_FOUND", `路径不存在: ${resolved.relative || "."}`);
    }
    if (!isWithin(this.root, real)) deniedPath("路径指向工作区之外");
    return { ...resolved, real, info };
  }

  private async ignores(relativePath: string): Promise<boolean> {
    if (!relativePath || relativePath === (this.options.ignoreFile ?? ".planrelayignore")) return false;
    const rules = await this.loadIgnore();
    return rules.ignores(relativePath);
  }

  private async loadIgnore(): Promise<Ignore> {
    if (!this.ignorePromise) {
      this.ignorePromise = (async () => {
        const rules = ignore();
        const configured = this.options.ignoreFile ?? ".planrelayignore";
        const file = this.resolveRelative(configured);
        if (isSensitive(file.relative)) return rules;
        try {
          const target = await this.existing(configured);
          if (!target.info.isFile() || target.info.isSymbolicLink()) return rules;
          rules.add(decodeText(await this.safeRead(target, 64 * 1024)));
        } catch (error) {
          if (!(error instanceof WorkspaceError && error.code === "NOT_FOUND")) throw error;
        }
        return rules;
      })();
    }
    return this.ignorePromise;
  }

  private async tracked(): Promise<Set<string>> {
    if (!this.trackedPromise) {
      this.trackedPromise = (async () => {
        try {
          const { stdout } = await execFileAsync("git", ["-C", this.root, "ls-files", "--cached", "-z"], { maxBuffer: 16 * 1024 * 1024 });
          return new Set(stdout.split("\0").filter(Boolean).map((p) => p.replaceAll("\\", "/")));
        } catch {
          // A non-Git workspace simply has no tracked files in least-privilege mode.
          return new Set<string>();
        }
      })();
    }
    return this.trackedPromise;
  }

  private async allowedFile(relativePath: string): Promise<boolean> {
    if (isSensitive(relativePath) || await this.ignores(relativePath)) return false;
    if (!this.trackedFilesOnly) return true;
    return (await this.tracked()).has(relativePath);
  }

  private async allowedDirectory(relativePath: string): Promise<boolean> {
    if (isSensitive(relativePath) || await this.ignores(relativePath)) return false;
    if (!this.trackedFilesOnly) return true;
    const prefix = relativePath ? `${relativePath}/` : "";
    for (const file of await this.tracked()) if (file.startsWith(prefix)) return true;
    return relativePath === "";
  }

  /**
   * Read through a descriptor opened with O_NOFOLLOW. The initial realpath
   * check prevents links escaping the root; O_NOFOLLOW closes the common race
   * where the final path component is replaced between that check and read.
   * The post-open realpath check also fails closed if a parent directory was
   * replaced while opening the file.
   */
  private async safeRead(target: { absolute: string; real: string; relative: string }, maxBytes: number): Promise<Buffer> {
    const noFollow = fsSync.constants.O_NOFOLLOW ?? 0;
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(target.absolute, fsSync.constants.O_RDONLY | noFollow);
      const opened = await realpath(target.absolute);
      if (!isWithin(this.root, opened) || opened !== target.real) deniedPath("文件在读取过程中改变了路径");
      const openedInfo = await handle.stat();
      if (!openedInfo.isFile()) throw new WorkspaceError("NOT_FILE", "目标不是普通文件");
      if (openedInfo.size > maxBytes) throw new WorkspaceError("FILE_TOO_LARGE", `文件超过 ${maxBytes} 字节限制`);
      const buffer = Buffer.alloc(Math.min(maxBytes + 1, Number.MAX_SAFE_INTEGER));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > maxBytes) throw new WorkspaceError("FILE_TOO_LARGE", `文件超过 ${maxBytes} 字节限制`);
      return buffer.subarray(0, bytesRead);
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code === "ELOOP" || code === "EXDEV" || code === "EACCES") deniedPath("文件链接不安全或无法读取");
      throw error;
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }

  async listDirectory(input = "", page: { cursor?: string; limit?: number } = {}): Promise<DirectoryPage> {
    const target = await this.existing(input);
    if (!target.info.isDirectory()) throw new WorkspaceError("NOT_DIRECTORY", "目标不是目录");
    if (!await this.allowedDirectory(target.relative)) deniedPath("目录被忽略或不在允许范围内");
    const children = await readdir(target.real, { withFileTypes: true });
    const entries: DirectoryEntry[] = [];
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      const childRel = target.relative ? `${target.relative}/${child.name}` : child.name;
      if (isSensitive(childRel) || await this.ignores(childRel)) continue;
      if (child.isSymbolicLink()) continue; // Never expose a link that can change its target during a request.
      if (child.isDirectory()) {
        if (!await this.allowedDirectory(childRel)) continue;
        entries.push({ path: childRel, name: child.name, kind: "directory" });
      } else if (child.isFile() && await this.allowedFile(childRel)) {
        const details = await lstat(resolve(target.real, child.name));
        entries.push({ path: childRel, name: child.name, kind: "file", size: details.size });
      }
    }
    const limit = Math.min(page.limit ?? 100, MAX_PAGE_SIZE);
    ensurePositiveInteger(limit, "limit");
    const start = fromPageCursor(page.cursor);
    const selected = entries.slice(start, start + limit);
    const hasMore = start + selected.length < entries.length;
    return { path: target.relative, entries: selected, hasMore, ...(hasMore ? { nextCursor: toPageCursor(start + selected.length) } : {}) };
  }

  async readFile(input: string, options: ReadFileOptions = {}): Promise<ReadFileResult> {
    const target = await this.existing(input);
    if (!target.info.isFile()) throw new WorkspaceError("NOT_FILE", "目标不是普通文件");
    if (!await this.allowedFile(target.relative)) deniedPath("文件被忽略、未跟踪或属于敏感文件");
    const maxBytes = Math.min(ensurePositiveInteger(options.maxBytes ?? this.options.maxReadBytes, "maxBytes"), this.options.maxReadBytes);
    const maxLines = Math.min(ensurePositiveInteger(options.maxLines ?? this.options.maxReadLines, "maxLines"), this.options.maxReadLines);
    const startLine = options.startLine ?? 1;
    if (!Number.isSafeInteger(startLine) || startLine < 1) throw new WorkspaceError("INVALID_OPTION", "startLine 必须从 1 开始");
    if (options.endLine !== undefined && (!Number.isSafeInteger(options.endLine) || options.endLine < startLine)) throw new WorkspaceError("INVALID_OPTION", "endLine 无效");
    if (target.info.size > maxBytes) throw new WorkspaceError("FILE_TOO_LARGE", `文件超过 ${maxBytes} 字节限制`);
    const buffer = await this.safeRead(target, maxBytes);
    const text = decodeText(buffer);
    const lines = text.split("\n").map((line) => line.endsWith("\r") ? line.slice(0, -1) : line);
    const requestedEnd = options.endLine ?? (startLine + maxLines - 1);
    const endLine = Math.min(requestedEnd, startLine + maxLines - 1, lines.length);
    const selected = startLine <= lines.length ? lines.slice(startLine - 1, endLine) : [];
    return {
      path: target.relative, content: selected.join("\n"), startLine,
      endLine: selected.length ? endLine : startLine - 1, totalLines: lines.length,
      truncated: endLine < Math.min(requestedEnd, lines.length), bytes: buffer.byteLength,
    };
  }

  private async collectFiles(input: string): Promise<string[]> {
    const target = await this.existing(input);
    if (target.info.isFile()) return await this.allowedFile(target.relative) ? [target.relative] : [];
    if (!target.info.isDirectory()) return [];
    if (!await this.allowedDirectory(target.relative)) return [];
    if (this.trackedFilesOnly) {
      const prefix = target.relative ? `${target.relative}/` : "";
      const files: string[] = [];
      for (const file of [...await this.tracked()].sort()) {
        if (!file.startsWith(prefix) || !await this.allowedFile(file)) continue;
        try {
          const candidate = await this.existing(file);
          if (candidate.info.isFile()) files.push(file);
        } catch { /* A tracked file can disappear while search starts. */ }
      }
      return files;
    }
    const found: string[] = [];
    const visit = async (absolute: string, prefix: string): Promise<void> => {
      const resolvedDirectory = await realpath(absolute);
      if (!isWithin(this.root, resolvedDirectory)) deniedPath("目录在搜索过程中指向工作区之外");
      const directoryInfo = await lstat(absolute);
      if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) deniedPath("搜索目录链接不安全");
      const children = await readdir(resolvedDirectory, { withFileTypes: true });
      for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
        const childRel = prefix ? `${prefix}/${child.name}` : child.name;
        if (isSensitive(childRel) || await this.ignores(childRel) || child.isSymbolicLink()) continue;
        if (child.isDirectory() && await this.allowedDirectory(childRel)) await visit(resolve(resolvedDirectory, child.name), childRel);
        else if (child.isFile() && await this.allowedFile(childRel)) found.push(childRel);
      }
    };
    await visit(target.real, target.relative);
    return found;
  }

  async searchText(query: string, options: SearchOptions = {}): Promise<SearchResult> {
    if (typeof query !== "string" || query.length === 0) throw new WorkspaceError("INVALID_QUERY", "搜索文本不能为空");
    if (query.length > 256) throw new WorkspaceError("INVALID_QUERY", "搜索表达式不能超过 256 个字符");
    const maxResults = Math.min(ensurePositiveInteger(options.maxResults ?? this.options.maxSearchResults, "maxResults"), this.options.maxSearchResults);
    const maxFiles = Math.min(ensurePositiveInteger(options.maxFiles ?? this.options.maxSearchFiles, "maxFiles"), this.options.maxSearchFiles);
    const maxFileBytes = Math.min(ensurePositiveInteger(options.maxFileBytes ?? this.options.maxSearchFileBytes, "maxFileBytes"), this.options.maxSearchFileBytes);
    const timeoutMs = Math.min(ensurePositiveInteger(options.timeoutMs ?? this.options.searchTimeoutMs, "timeoutMs"), this.options.searchTimeoutMs);
    if (options.regex) throw new WorkspaceError("UNSAFE_REGEX", "安全模式暂不支持正则搜索，请使用字面量查询");
    const files = await this.collectFiles(options.path ?? "");
    const scan = files.slice(0, maxFiles);
    let explicitFile = false;
    if (options.path !== undefined) {
      try { explicitFile = (await this.existing(options.path)).info.isFile(); } catch { /* collectFiles reports the safe empty result */ }
    }
    const matches: SearchMatch[] = [];
    let outputBytes = 0;
    const maxOutputBytes = 128 * 1024;
    const started = performance.now();
    let filesScanned = 0;
    for (const file of scan) {
      if (performance.now() - started > timeoutMs) throw new WorkspaceError("SEARCH_TIMEOUT", "搜索超过时间限制");
      const target = await this.existing(file);
      if (target.info.size > maxFileBytes) continue;
      let text: string;
      try {
        text = decodeText(await this.safeRead(target, maxFileBytes));
      } catch (error) {
        // Recursive searches skip binary files; an explicitly requested binary
        // file is an actionable error and must not be silently hidden.
        if (error instanceof WorkspaceError && error.code === "BINARY_FILE" && explicitFile) throw error;
        if (error instanceof WorkspaceError && error.code === "BINARY_FILE") continue;
        throw error;
      }
      filesScanned++;
      const lines = text.split("\n");
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        if (performance.now() - started > timeoutMs) throw new WorkspaceError("SEARCH_TIMEOUT", "搜索超过时间限制");
        const line = lines[lineIndex].replace(/\r$/, "");
        const needle = options.caseSensitive === false ? query.toLocaleLowerCase() : query;
        const haystack = options.caseSensitive === false ? line.toLocaleLowerCase() : line;
        let offset = 0;
        while ((offset = haystack.indexOf(needle, offset)) !== -1) {
          const excerptStart = Math.max(0, offset - 512);
          const excerptEnd = Math.min(line.length, offset + needle.length + 512);
          const excerpt = `${excerptStart > 0 ? "…" : ""}${line.slice(excerptStart, excerptEnd)}${excerptEnd < line.length ? "…" : ""}`;
          const match = { path: file, line: lineIndex + 1, column: offset + 1, text: excerpt };
          const matchBytes = Buffer.byteLength(JSON.stringify(match), "utf8");
          if (outputBytes + matchBytes > maxOutputBytes) return { query, matches, filesScanned, truncated: true, engine: "node" };
          outputBytes += matchBytes;
          matches.push(match);
          if (matches.length >= maxResults) return { query, matches, filesScanned, truncated: true, engine: "node" };
          offset += Math.max(needle.length, 1);
        }
      }
    }
    return { query, matches, filesScanned, truncated: files.length > scan.length, engine: "node" };
  }
}

// Synchronous startup checks keep constructor deterministic without exposing
// fs.realpathSync in the public API.
function requireRealpath(path: string): string {
  return fsSync.realpathSync(path);
}

function isDirectorySync(path: string): boolean {
  return fsSync.statSync(path).isDirectory();
}

export function createWorkspace(options: WorkspaceOptions): Workspace {
  return new Workspace(options);
}

export { isSensitive, normalizedRelative };
