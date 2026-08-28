#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { realpath } from "node:fs/promises";
import { cwd } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command, type Command as CommandType } from "commander";
import { createWorkspace } from "../workspace/index.js";
import { GitReader } from "../git/index.js";
import { CoordinationStore, defaultStateDir } from "../coordination/index.js";
import { recordExecution } from "../mcp/execution.js";
import { startHttpServer } from "../transport/http.js";
import { serveStdio } from "../transport/stdio.js";
import { NAME, VERSION } from "../version.js";

type CliOptions = { workspace?: string; stateDir?: string; json?: boolean; transport?: "stdio" | "http"; host?: string; port?: number; path?: string };

function options(command: CommandType): CliOptions {
  return { ...(command.parent?.opts() ?? {}), ...command.opts() } as CliOptions;
}

function workspaceRoot(opts: CliOptions): string {
  return path.resolve(opts.workspace || process.env.HUA_PLANRELAY_WORKSPACE || cwd());
}

function stateDirectory(opts: CliOptions): string | undefined {
  return opts.stateDir || process.env.HUA_PLANRELAY_STATE_DIR || process.env.PLANRELAY_STATE_DIR;
}

function print(value: unknown, json = false): void {
  if (json) process.stdout.write(`${JSON.stringify(value)}\n`);
  else if (typeof value === "string") process.stdout.write(`${value}\n`);
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function common(command: Command): Command {
  return command.option("--workspace <path>", "workspace root (default: HUA_PLANRELAY_WORKSPACE or current directory)")
    .option("--state-dir <path>", "application state directory")
    .option("--json", "emit JSON");
}

async function taskRecords(root: string, stateDir?: string, task?: string, iteration?: number) {
  return new CoordinationStore({ workspaceRoot: root, stateDir }).list(undefined, { task_id: task, iteration });
}

export function buildCli(): Command {
  const program = new Command();
  program.name(NAME).description("Hua PlanRelay: a workspace-safe planning and review relay").version(VERSION);
  program.option("--json", "emit JSON");

  const serve = common(program.command("serve").description("start the MCP gateway"))
    .option("--transport <transport>", "stdio or http", "stdio")
    .option("--host <host>", "HTTP bind host (must be 127.0.0.1)", "127.0.0.1")
    .option("--port <port>", "HTTP port", (value) => Number.parseInt(value, 10))
    .option("--path <path>", "MCP HTTP endpoint", "/mcp");
  serve.action(async (_commandOptions: CliOptions, command: Command) => {
    const opts = options(command);
    const root = workspaceRoot(opts);
    if (opts.transport === "http") {
      const server = await startHttpServer({ workspaceRoot: root, stateDir: stateDirectory(opts), host: opts.host, port: opts.port, path: opts.path });
      const address = server.address();
      if (!opts.json) process.stderr.write(`Hua PlanRelay MCP listening on ${typeof address === "object" && address ? `http://127.0.0.1:${address.port}${opts.path || "/mcp"}` : "127.0.0.1"}\n`);
      return;
    }
    if (opts.transport !== "stdio") throw new Error("--transport must be stdio or http");
    await serveStdio({ workspaceRoot: root, stateDir: stateDirectory(opts) });
  });

  const workspace = common(program.command("workspace").description("show workspace policy and Git identity"));
  workspace.action(async (_commandOptions: CliOptions, command: Command) => {
    const opts = options(command); const root = workspaceRoot(opts); const ws = createWorkspace({ root }); const git = new GitReader({ workspaceRoot: ws.root });
    print({ ...ws.info(), git: await git.info() }, Boolean(opts.json));
  });

  const doctor = common(program.command("doctor").description("check local prerequisites and safety defaults"));
  doctor.action(async (_commandOptions: CliOptions, command: Command) => {
    const opts = options(command); const root = workspaceRoot(opts); const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
    try { const ws = createWorkspace({ root }); checks.push({ name: "workspace", ok: true, detail: ws.root }); } catch (error) { checks.push({ name: "workspace", ok: false, detail: error instanceof Error ? error.message : "invalid workspace" }); }
    try { const info = await new GitReader({ workspaceRoot: root }).info(); checks.push({ name: "git", ok: true, detail: info.isRepo ? `repository (${info.branch || "detached"})` : "not a Git repository" }); } catch (error) { checks.push({ name: "git", ok: false, detail: error instanceof Error ? error.message : "Git unavailable" }); }
    const state = path.resolve(stateDirectory(opts) || defaultStateDir());
    const rootReal = await realpath(root).catch(() => path.resolve(root));
    const stateReal = await realpath(state).catch(async () => path.join(await realpath(path.dirname(state)).catch(() => path.dirname(state)), path.basename(state)));
    const stateRelative = path.relative(rootReal, stateReal);
    const stateOutside = stateRelative === ".." || stateRelative.startsWith(`..${path.sep}`) || path.isAbsolute(stateRelative);
    checks.push({ name: "state", ok: stateOutside, detail: "state is outside workspace" });
    checks.push({ name: "http", ok: (opts.host || "127.0.0.1") === "127.0.0.1", detail: "HTTP transport is loopback-only" });
    print({ ok: checks.every((check) => check.ok), workspace: root, checks }, Boolean(opts.json));
    if (checks.some((check) => !check.ok)) process.exitCode = 1;
  });

  const task = program.command("task").description("manage append-only task records");
  const taskCreate = common(task.command("create").requiredOption("--goal <goal>", "task goal").option("--title <title>", "task title"));
  taskCreate.action(async (_commandOptions: CliOptions, command: Command) => {
    const opts = options(command); const values = command.opts(); const root = workspaceRoot(opts); const git = await new GitReader({ workspaceRoot: root }).info(); const id = `task-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
    const store = new CoordinationStore({ workspaceRoot: root, stateDir: stateDirectory(opts) });
    const record = await store.appendTask({ task_id: id, iteration: 0, baseCommit: git.head, idempotency: id, title: values.title || values.goal, prompt: values.goal });
    print(record, Boolean(opts.json));
  });
  const taskShow = common(task.command("show").requiredOption("--task <task>", "task ID").option("--iteration <iteration>", "iteration", (value) => Number.parseInt(value, 10)));
  taskShow.action(async (_commandOptions: CliOptions, command: Command) => { const opts = options(command); print(await taskRecords(workspaceRoot(opts), stateDirectory(opts), command.opts().task, command.opts().iteration), Boolean(opts.json)); });

  const plan = program.command("plan").description("inspect append-only plan records");
  const planShow = common(plan.command("show").requiredOption("--task <task>", "task ID").option("--iteration <iteration>", "iteration", (value) => Number.parseInt(value, 10)));
  planShow.action(async (_commandOptions: CliOptions, command: Command) => { const opts = options(command); print((await taskRecords(workspaceRoot(opts), stateDirectory(opts), command.opts().task, command.opts().iteration)).filter((record) => record.type === "plan"), Boolean(opts.json)); });

  const review = program.command("review").description("inspect append-only review records");
  const reviewShow = common(review.command("show").requiredOption("--task <task>", "task ID").option("--iteration <iteration>", "iteration", (value) => Number.parseInt(value, 10)));
  reviewShow.action(async (_commandOptions: CliOptions, command: Command) => { const opts = options(command); print((await taskRecords(workspaceRoot(opts), stateDirectory(opts), command.opts().task, command.opts().iteration)).filter((record) => record.type === "review"), Boolean(opts.json)); });

  const record = common(program.command("record").requiredOption("--task <task>", "task ID").requiredOption("--iteration <iteration>", "iteration", (value) => Number.parseInt(value, 10)).requiredOption("--status <status>", "ok or failed").option("--changed-files <files>", "comma-separated changed files", "").option("--tests <summary>", "test summary", ""));
  record.action(async (_commandOptions: CliOptions, command: Command) => {
    const opts = options(command); const values = command.opts();
    if (values.status !== "ok" && values.status !== "failed") throw new Error("--status must be ok or failed");
    const saved = await recordExecution(workspaceRoot(opts), { taskId: values.task, iteration: values.iteration, status: values.status, changedFiles: String(values.changedFiles).split(",").map((item: string) => item.trim()).filter(Boolean), tests: values.tests }, stateDirectory(opts));
    print(saved, Boolean(opts.json));
  });
  return program;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  buildCli().parseAsync().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "command failed"}\n`); process.exitCode = 1; });
}
