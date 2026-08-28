import { createHash, createHmac, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, readFile, readdir, realpath, link, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

const MAX_TEXT = 64 * 1024;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const COMMIT = /^[0-9a-f]{7,64}$/i;

const baseFields = {
  version: z.literal(1),
  task_id: z.string().regex(ID),
  iteration: z.number().int().nonnegative().max(1_000_000),
  baseCommit: z.string().regex(COMMIT).nullable(),
  idempotency: z.string().regex(ID),
  createdAt: z.number().int().positive(),
};

export const TaskRecordSchema = z.object({
  ...baseFields,
  type: z.literal("task"),
  title: z.string().min(1).max(512),
  prompt: z.string().min(1).max(MAX_TEXT),
  maxIterations: z.number().int().min(1).max(20).default(3),
}).strict();

const PlanStepSchema = z.object({
  id: z.string().regex(ID),
  title: z.string().min(1).max(512),
  description: z.string().max(MAX_TEXT),
  files: z.array(z.string().max(1024)).max(100).default([]),
  verification: z.string().max(MAX_TEXT).default(""),
}).strict();

export const PlanRecordSchema = z.object({
  ...baseFields,
  type: z.literal("plan"),
  steps: z.array(PlanStepSchema).min(1).max(100),
  summary: z.string().max(MAX_TEXT),
}).strict();

const FindingSchema = z.object({
  severity: z.enum(["info", "low", "medium", "high", "critical"]),
  title: z.string().min(1).max(512),
  detail: z.string().max(MAX_TEXT),
  path: z.string().max(1024).nullable().default(null),
}).strict();

export const EvidenceSchema = z.object({
  baseCommit: z.string().regex(COMMIT).nullable(),
  headCommit: z.string().regex(COMMIT).nullable(),
  diffDigest: z.string().regex(/^[0-9a-f]{64}$/),
  statusDigest: z.string().regex(/^[0-9a-f]{64}$/),
  testsDigest: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export const ReviewRecordSchema = z.object({
  ...baseFields,
  type: z.literal("review"),
  verdict: z.enum(["approved", "changes_requested", "blocked"]),
  summary: z.string().max(MAX_TEXT),
  findings: z.array(FindingSchema).max(100),
  evidence: EvidenceSchema.optional(),
}).strict();

export type TaskRecord = z.infer<typeof TaskRecordSchema>;
export type PlanRecord = z.infer<typeof PlanRecordSchema>;
export type ReviewRecord = z.infer<typeof ReviewRecordSchema>;
export type CoordinationRecord = TaskRecord | PlanRecord | ReviewRecord;
export type RecordKind = CoordinationRecord["type"];

export type TaskInput = Omit<TaskRecord, "type" | "version" | "createdAt" | "maxIterations"> & { createdAt?: number; maxIterations?: number };
export type PlanInput = Omit<PlanRecord, "type" | "version" | "createdAt"> & { createdAt?: number };
export type ReviewInput = Omit<ReviewRecord, "type" | "version" | "createdAt"> & { createdAt?: number };

export class CoordinationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoordinationError";
  }
}

export function defaultStateDir(): string {
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "hua-planrelay");
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "hua-planrelay");
  return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "hua-planrelay");
}

export class CoordinationStore {
  readonly workspaceRoot: string;
  readonly stateDir: string;
  workspaceId = "";
  private readonly ready: Promise<void>;

  constructor(options: { workspaceRoot: string; stateDir?: string }) {
    this.workspaceRoot = path.resolve(options.workspaceRoot);
    this.stateDir = path.resolve(options.stateDir ?? defaultStateDir());
    this.workspaceId = createHash("sha256").update(this.workspaceRoot).digest("hex");
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    const root = await realpath(this.workspaceRoot).catch(() => { throw new CoordinationError("workspace root must exist"); });
    const projectedState = await resolveThroughExistingAncestor(this.stateDir);
    if (isWithin(root, projectedState)) throw new CoordinationError("coordination state must be outside the workspace");
    await ensureDirectory(this.stateDir);
    const existingState = await realpath(this.stateDir);
    if (isWithin(root, existingState)) throw new CoordinationError("coordination state must be outside the workspace");
    const salt = await loadOrCreateSalt(path.join(this.stateDir, ".workspace-salt"));
    this.workspaceId = createHmac("sha256", salt).update(root).digest("hex");
    await ensureDirectory(path.join(this.stateDir, "workspaces", this.workspaceId));
  }

  async appendTask(input: TaskInput): Promise<TaskRecord> {
    return this.append({ ...input, type: "task", version: 1, createdAt: input.createdAt ?? now() } as TaskRecord, TaskRecordSchema, input.createdAt === undefined);
  }

  async appendPlan(input: PlanInput): Promise<PlanRecord> {
    await this.ensureTaskBinding(input);
    return this.append({ ...input, type: "plan", version: 1, createdAt: input.createdAt ?? now() } as PlanRecord, PlanRecordSchema, input.createdAt === undefined);
  }

  async appendReview(input: ReviewInput): Promise<ReviewRecord> {
    await this.ensureTaskBinding(input);
    return this.append({ ...input, type: "review", version: 1, createdAt: input.createdAt ?? now() } as ReviewRecord, ReviewRecordSchema, input.createdAt === undefined);
  }

  async list(kind?: RecordKind, filter: { task_id?: string; iteration?: number } = {}): Promise<CoordinationRecord[]> {
    await this.ready;
    const kinds: RecordKind[] = kind ? [kind] : ["task", "plan", "review"];
    const records: CoordinationRecord[] = [];
    for (const recordKind of kinds) {
      const dir = this.recordDirectory(recordKind);
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const full = path.join(dir, entry.name);
        const parsed = await this.readRecord(full, recordKind);
        if (filter.task_id && parsed.task_id !== filter.task_id) continue;
        if (filter.iteration !== undefined && parsed.iteration !== filter.iteration) continue;
        records.push(parsed);
      }
    }
    const order: Record<RecordKind, number> = { task: 0, plan: 1, review: 2 };
    records.sort((a, b) => a.createdAt - b.createdAt || order[a.type] - order[b.type]
      || a.task_id.localeCompare(b.task_id) || a.iteration - b.iteration || a.idempotency.localeCompare(b.idempotency));
    return records;
  }

  async read(kind: RecordKind, taskId: string, iteration: number, idempotency: string): Promise<CoordinationRecord | null> {
    await this.ready;
    const identity = identityHash(kind, taskId, iteration, idempotency);
    const file = path.join(this.recordDirectory(kind), `${identity}.json`);
    try { return await this.readRecord(file, kind); } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  private async append<T extends CoordinationRecord>(record: T, schema: z.ZodTypeAny, generatedTimestamp: boolean): Promise<T> {
    await this.ready;
    const parsed = schema.parse(record);
    const file = path.join(this.recordDirectory(parsed.type), `${identityHash(parsed.type, parsed.task_id, parsed.iteration, parsed.idempotency)}.json`);
    await ensureDirectory(this.recordDirectory(parsed.type));
    try {
      await atomicCreateJson(file, parsed);
      return parsed;
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      const existing = await this.readRecord(file, parsed.type);
      const sameContent = JSON.stringify(existing) === JSON.stringify(parsed);
      const sameExceptTimestamp = generatedTimestamp && JSON.stringify({ ...existing, createdAt: 0 }) === JSON.stringify({ ...parsed, createdAt: 0 });
      if (!sameContent && !sameExceptTimestamp) throw new CoordinationError("idempotency key already exists with different content");
      return existing as T;
    }
  }

  private async ensureTaskBinding(input: { task_id: string; iteration: number; baseCommit: string | null }): Promise<void> {
    const tasks = await this.list("task", { task_id: input.task_id });
    if (tasks.length === 0) throw new CoordinationError("plan/review requires an existing task with the same task_id and iteration");
    if (!tasks.some((task) => task.baseCommit === input.baseCommit)) throw new CoordinationError("baseCommit does not match the task");
  }

  private recordDirectory(kind: RecordKind): string {
    return path.join(this.stateDir, "workspaces", this.workspaceId, `${kind}s`);
  }

  private async readRecord(file: string, kind: RecordKind): Promise<CoordinationRecord> {
    const raw = await readFile(file, "utf8");
    const schema = kind === "task" ? TaskRecordSchema : kind === "plan" ? PlanRecordSchema : ReviewRecordSchema;
    return schema.parse(JSON.parse(raw));
  }
}

function now(): number { return Math.floor(Date.now() / 1000); }

function identityHash(kind: RecordKind, taskId: string, iteration: number, idempotency: string): string {
  return createHash("sha256").update(`${kind}\0${taskId}\0${iteration}\0${idempotency}`).digest("hex");
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function resolveThroughExistingAncestor(candidate: string): Promise<string> {
  let ancestor = path.resolve(candidate);
  while (true) {
    try {
      const resolved = await realpath(ancestor);
      return path.resolve(resolved, path.relative(ancestor, candidate));
    } catch (error) {
      if (!isNotFound(error)) throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw new CoordinationError("cannot resolve state directory");
      ancestor = parent;
    }
  }
}

async function ensureDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new CoordinationError("state path is not a real directory");
  await chmod(directory, 0o700);
}

async function atomicCreateJson(destination: string, value: unknown): Promise<void> {
  const directory = path.dirname(destination);
  const temp = path.join(directory, `.${path.basename(destination)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  const content = `${JSON.stringify(value)}\n`;
  const handle = await open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    // link() gives us create-without-overwrite semantics while retaining the
    // fsync'ed temporary file. This is atomic on the same filesystem.
    await link(temp, destination);
  } finally {
    await unlink(temp).catch(() => undefined);
  }
  await chmod(destination, 0o600);
}

async function loadOrCreateSalt(destination: string): Promise<Buffer> {
  try {
    const info = await lstat(destination);
    if (!info.isFile() || info.isSymbolicLink()) throw new CoordinationError("workspace salt is not a regular file");
    await chmod(destination, 0o600);
    const salt = await readFile(destination);
    if (salt.byteLength !== 32) throw new CoordinationError("workspace salt is invalid");
    return salt;
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  const salt = randomBytes(32);
  const temp = `${destination}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  const handle = await open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    await handle.writeFile(salt);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temp, destination);
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
  } finally {
    await unlink(temp).catch(() => undefined);
  }
  if (await exists(destination)) return readFile(destination);
  return salt;
}

async function exists(file: string): Promise<boolean> {
  try { await lstat(file); return true; } catch { return false; }
}

function isNotFound(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT"; }
function isAlreadyExists(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "EEXIST"; }
