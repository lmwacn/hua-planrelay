import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/mcp/server.js";
import { CoordinationStore } from "../src/coordination/index.js";
import { recordExecution, readExecution } from "../src/mcp/execution.js";

const cleanups: string[] = [];
afterEach(async () => { await Promise.all(cleanups.splice(0).map((item) => rm(item, { recursive: true, force: true }))); });

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "hua-planrelay-mcp-"));
  const state = await mkdtemp(path.join(os.tmpdir(), "hua-planrelay-state-"));
  await writeFile(path.join(root, "README.md"), "hello\nsecond\n");
  await mkdir(path.join(root, "sub"));
  cleanups.push(root, state);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer({ workspaceRoot: root, stateDir: state, trackedFilesOnly: false });
  const client = new Client({ name: "test-client", version: "1" });
  await server.connect(serverTransport); await client.connect(clientTransport);
  return { server, client, state, root };
}

describe("MCP contract", () => {
  it("advertises all tools with safe annotations and structured results", async () => {
    const { client, server } = await setup();
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual([
      "workspace_info", "list_files", "read_file_range", "search_text", "git_status", "git_diff", "current_task", "test_summary", "publish_plan", "publish_review",
    ]);
    for (const tool of listed.tools) expect(tool.inputSchema.type).toBe("object");
    expect(listed.tools.find((tool) => tool.name === "publish_plan")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, openWorldHint: false });
    const result = await client.callTool({ name: "read_file_range", arguments: { path: "README.md", startLine: 1, endLine: 1 } });
    expect(result.isError).not.toBe(true); expect(result.structuredContent).toMatchObject({ path: "README.md", content: "hello" });
    const info = await client.callTool({ name: "workspace_info", arguments: {} });
    expect(info.structuredContent).toMatchObject({ rootAlias: "workspace://bound", workspaceName: expect.any(String) });
    expect(JSON.stringify(info.structuredContent)).not.toContain("/hua-planrelay-mcp-");
    // Force the coordination store's asynchronous initialization to settle before cleanup.
    await client.callTool({ name: "current_task", arguments: {} });
    await client.close(); await server.close();
  });

  it("keeps coordination writes append-only and schema validated", async () => {
    const { client, server, state, root } = await setup();
    const taskId = "task-test";
    await new CoordinationStore({ workspaceRoot: root, stateDir: state }).appendTask({ task_id: taskId, iteration: 0, baseCommit: null, idempotency: "task-test", title: "Test", prompt: "Test" });
    const created = await client.callTool({ name: "publish_plan", arguments: {
      task_id: taskId, iteration: 0, baseCommit: null, idempotency: "plan-test", steps: [{ id: "step-1", title: "Inspect", description: "Inspect the bounded workspace." }], summary: "A finite plan",
    }});
    expect(created.isError).not.toBe(true);
    expect(created.structuredContent).toMatchObject({ type: "plan", task_id: taskId });
    const task = await client.callTool({ name: "current_task", arguments: {} });
    expect(task.structuredContent).toMatchObject({ task: { task_id: taskId } });
    await client.close(); await server.close();
  });

  it("records execution idempotently under the coordination workspace identity", async () => {
    const { root, state } = await setup();
    const first = await recordExecution(root, { taskId: "task-exec", iteration: 1, status: "ok", changedFiles: ["src/a.ts"], tests: "passed" }, state);
    const second = await recordExecution(root, { taskId: "task-exec", iteration: 1, status: "ok", changedFiles: ["src/a.ts"], tests: "passed" }, state);
    expect(second.createdAt).toBe(first.createdAt);
    expect(await readExecution(root, { taskId: "task-exec", iteration: 1 }, state)).toEqual(first);
  });
});
