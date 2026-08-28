import { createHash } from "node:crypto";
import { chmod, link, mkdir, open, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { CoordinationStore } from "../coordination/index.js";

export type ExecutionRecord = {
  taskId: string;
  iteration: number;
  status: "ok" | "failed";
  changedFiles: string[];
  tests: string;
  createdAt: number;
  idempotency: string;
};

const ExecutionSchema = z.object({
  taskId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
  iteration: z.number().int().nonnegative().max(1_000_000),
  status: z.enum(["ok", "failed"]),
  changedFiles: z.array(z.string().max(1024)).max(100),
  tests: z.string().max(64 * 1024),
  createdAt: z.number().int().positive(),
  idempotency: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
}).strict();

function fileKey(idempotency: string): string { return createHash("sha256").update(idempotency).digest("hex"); }

async function executionDirectory(workspaceRoot: string, stateDir?: string): Promise<string> {
  // CoordinationStore is the authority for the salted HMAC workspace identity.
  const store = new CoordinationStore({ workspaceRoot, stateDir });
  await store.list("task");
  const directory = path.join(store.stateDir, "workspaces", store.workspaceId, "executions");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  return directory;
}

async function appendJson(file: string, value: ExecutionRecord): Promise<ExecutionRecord> {
  const validated = ExecutionSchema.parse(value);
  const temp = `${file}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  const handle = await open(temp, "wx", 0o600);
  try { await handle.writeFile(`${JSON.stringify(validated)}\n`, "utf8"); await handle.sync(); } finally { await handle.close(); }
  try {
    await link(temp, file);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code !== "EEXIST") throw error;
    const current = ExecutionSchema.parse(JSON.parse(await readFile(file, "utf8")));
    const same = (a: ExecutionRecord, b: ExecutionRecord) => JSON.stringify({ ...a, createdAt: 0 }) === JSON.stringify({ ...b, createdAt: 0 });
    if (!same(current, validated)) throw new Error("execution idempotency key already exists with different content");
    return current;
  } finally { await unlink(temp).catch(() => undefined); }
  await chmod(file, 0o600);
  return validated;
}

export async function recordExecution(workspaceRoot: string, record: Omit<ExecutionRecord, "createdAt" | "idempotency"> & { createdAt?: number; idempotency?: string }, stateDir?: string): Promise<ExecutionRecord> {
  const idempotency = record.idempotency ?? `execution-${record.taskId}-${record.iteration}`;
  const value = ExecutionSchema.parse({ ...record, idempotency, createdAt: record.createdAt ?? Math.floor(Date.now() / 1000) });
  const directory = await executionDirectory(workspaceRoot, stateDir);
  return appendJson(path.join(directory, `${fileKey(idempotency)}.json`), value);
}

export async function readExecution(workspaceRoot: string, filter: { taskId?: string; iteration?: number } = {}, stateDir?: string): Promise<ExecutionRecord | null> {
  const directory = await executionDirectory(workspaceRoot, stateDir);
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const values: ExecutionRecord[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const value = ExecutionSchema.parse(JSON.parse(await readFile(path.join(directory, entry.name), "utf8")));
      if ((!filter.taskId || value.taskId === filter.taskId) && (filter.iteration === undefined || value.iteration === filter.iteration)) values.push(value);
    } catch { /* ignore an incomplete/untrusted record */ }
  }
  values.sort((a, b) => b.createdAt - a.createdAt);
  return values[0] ?? null;
}
