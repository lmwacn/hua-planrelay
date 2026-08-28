import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CoordinationError, CoordinationStore } from "../src/coordination/index.js";

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

async function store() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "hua-planrelay-workspace-"));
  const state = await mkdtemp(path.join(os.tmpdir(), "hua-planrelay-state-"));
  temporary.push(workspace, state);
  return { workspace, state, relay: new CoordinationStore({ workspaceRoot: workspace, stateDir: state }) };
}

describe("CoordinationStore", () => {
  it("writes strict, external, mode-0600 immutable records and binds plan/review", async () => {
    const { relay, state } = await store();
    const task = await relay.appendTask({ task_id: "task-1", iteration: 1, baseCommit: "0123456789abcdef", idempotency: "request-1", title: "Implement", prompt: "Do the work" });
    const plan = await relay.appendPlan({ task_id: task.task_id, iteration: 1, baseCommit: task.baseCommit, idempotency: "plan-1", summary: "Small plan", steps: [{ id: "step-1", title: "Code", description: "Implement it", files: [], verification: "test" }] });
    const review = await relay.appendReview({ task_id: task.task_id, iteration: 1, baseCommit: task.baseCommit, idempotency: "review-1", verdict: "approved", summary: "Looks good", findings: [] });
    expect((await relay.list()).map((record) => record.type)).toEqual(["task", "plan", "review"]);
    expect(await relay.read("plan", "task-1", 1, "plan-1")).toEqual(plan);
    expect(await relay.read("review", "task-1", 1, "review-1")).toEqual(review);
    const workspaceDir = path.join(state, "workspaces", relay.workspaceId);
    const kindFiles = await Promise.all(["tasks", "plans", "reviews"].map(async (kind) => (await readdir(path.join(workspaceDir, kind))).filter((name) => name.endsWith(".json")).map((name) => path.join(workspaceDir, kind, name))));
    for (const file of kindFiles.flat()) expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(workspaceDir.startsWith(state)).toBe(true);
    expect((await readFile(kindFiles[0][0], "utf8")).endsWith("\n")).toBe(true);
    expect((await stat(path.join(state, ".workspace-salt"))).mode & 0o777).toBe(0o600);
  });

  it("is idempotent and rejects conflicting reuse or mismatched bindings", async () => {
    const { relay } = await store();
    const input = { task_id: "task-2", iteration: 2, baseCommit: null, idempotency: "same", title: "Task", prompt: "Prompt" };
    const first = await relay.appendTask(input);
    expect(await relay.appendTask(input)).toEqual(first);
    await expect(relay.appendTask({ ...input, prompt: "changed" })).rejects.toThrow(/idempotency/);
    await expect(relay.appendPlan({ task_id: "missing", iteration: 2, baseCommit: null, idempotency: "p", summary: "x", steps: [{ id: "s", title: "x", description: "x" }] })).rejects.toBeInstanceOf(CoordinationError);
    await expect(relay.appendReview({ task_id: first.task_id, iteration: 2, baseCommit: "0123456", idempotency: "r", verdict: "blocked", summary: "x", findings: [] })).rejects.toThrow(/baseCommit/);
  });

  it("never accepts state inside the workspace", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "hua-planrelay-workspace-"));
    temporary.push(workspace);
    const relay = new CoordinationStore({ workspaceRoot: workspace, stateDir: path.join(workspace, ".state") });
    await expect(relay.appendTask({ task_id: "x", iteration: 1, baseCommit: null, idempotency: "x", title: "x", prompt: "x" })).rejects.toThrow(/outside/);
  });

  it("creates a missing external state parent on first run", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "hua-planrelay-workspace-"));
    const parent = await mkdtemp(path.join(os.tmpdir(), "hua-planrelay-parent-"));
    const state = path.join(parent, "missing", "nested", "state");
    temporary.push(workspace, parent);
    const relay = new CoordinationStore({ workspaceRoot: workspace, stateDir: state });
    await relay.appendTask({ task_id: "first-run", iteration: 0, baseCommit: null, idempotency: "first-run", title: "First run", prompt: "Initialize" });
    expect((await stat(state)).isDirectory()).toBe(true);
  });
});
