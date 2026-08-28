import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { CoordinationStore } from "../src/coordination/index.js";
import { recordExecution } from "../src/mcp/execution.js";
import { workflowStatus } from "../src/workflow/index.js";

const execFileAsync = promisify(execFile);
const cleanup: string[] = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map((item) => rm(item, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "hua-planrelay-flow-"));
  const state = await mkdtemp(path.join(os.tmpdir(), "hua-planrelay-state-"));
  cleanup.push(root, state);
  await execFileAsync("git", ["init", root]);
  await execFileAsync("git", ["-C", root, "config", "user.email", "test@example.com"]);
  await execFileAsync("git", ["-C", root, "config", "user.name", "Test"]);
  await writeFile(path.join(root, "file.txt"), "one\n");
  await execFileAsync("git", ["-C", root, "add", "file.txt"]);
  await execFileAsync("git", ["-C", root, "commit", "-m", "init"]);
  const { stdout } = await execFileAsync("git", ["-C", root, "rev-parse", "HEAD"]);
  const store = new CoordinationStore({ workspaceRoot: root, stateDir: state });
  const task = await store.appendTask({ task_id: "flow", iteration: 0, baseCommit: stdout.trim(), idempotency: "flow", title: "Flow", prompt: "Flow", maxIterations: 2 });
  return { root, state, store, task };
}

describe("workflow status", () => {
  it("derives bounded phases from append-only records", async () => {
    const { root, state, store, task } = await fixture();
    expect((await workflowStatus(root, task.task_id, state))?.phase).toBe("awaiting_plan");
    await store.appendPlan({ task_id: task.task_id, iteration: 0, baseCommit: task.baseCommit, idempotency: "plan", summary: "Plan", steps: [{ id: "s", title: "Edit", description: "Edit" }] });
    expect((await workflowStatus(root, task.task_id, state))?.phase).toBe("ready_to_execute");
    await writeFile(path.join(root, "file.txt"), "two\n");
    const execution = await recordExecution(root, { taskId: task.task_id, iteration: 0, status: "ok", changedFiles: ["file.txt"], tests: "ok" }, state);
    expect((await workflowStatus(root, task.task_id, state))?.phase).toBe("awaiting_review");
    await store.appendReview({ task_id: task.task_id, iteration: 0, baseCommit: task.baseCommit, idempotency: "review", verdict: "changes_requested", summary: "Again", findings: [], evidence: execution.evidence });
    expect((await workflowStatus(root, task.task_id, state))?.phase).toBe("changes_requested");
    const next = await recordExecution(root, { taskId: task.task_id, iteration: 1, status: "ok", changedFiles: ["file.txt"], tests: "ok again" }, state);
    expect(next.iteration).toBe(1);
    expect((await workflowStatus(root, task.task_id, state))?.phase).toBe("awaiting_review");
  });

  it("rejects execution beyond the configured iteration limit", async () => {
    const { root, state, task } = await fixture();
    await expect(recordExecution(root, { taskId: task.task_id, iteration: 2, status: "ok", changedFiles: [], tests: "ok" }, state)).rejects.toThrow(/iteration limit/);
  });
});
