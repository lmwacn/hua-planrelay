import { CoordinationStore, type ReviewRecord, type TaskRecord } from "../coordination/index.js";
import { readExecution, type ExecutionRecord } from "../mcp/execution.js";

export type WorkflowPhase =
  | "awaiting_plan"
  | "ready_to_execute"
  | "execution_failed"
  | "awaiting_review"
  | "changes_requested"
  | "done"
  | "blocked"
  | "iteration_limit_reached";

export type WorkflowStatus = {
  task: TaskRecord;
  phase: WorkflowPhase;
  iteration: number;
  maxIterations: number;
  planAvailable: boolean;
  execution: ExecutionRecord | null;
  review: ReviewRecord | null;
  nextAction: string;
};

export async function workflowStatus(workspaceRoot: string, taskId?: string, stateDir?: string): Promise<WorkflowStatus | null> {
  const store = new CoordinationStore({ workspaceRoot, stateDir });
  const all = await store.list(undefined, { task_id: taskId });
  const tasks = all.filter((record): record is TaskRecord => record.type === "task");
  const task = tasks.at(-1);
  if (!task) return null;
  const plans = all.filter((record) => record.type === "plan" && record.task_id === task.task_id);
  const reviews = all.filter((record): record is ReviewRecord => record.type === "review" && record.task_id === task.task_id);
  const executions: ExecutionRecord[] = [];
  for (let iteration = 0; iteration < task.maxIterations; iteration += 1) {
    const value = await readExecution(workspaceRoot, { taskId: task.task_id, iteration }, stateDir);
    if (value) executions.push(value);
  }
  const iteration = Math.max(0, ...plans.map((record) => record.iteration), ...reviews.map((record) => record.iteration), ...executions.map((record) => record.iteration));
  const planAvailable = plans.some((record) => record.iteration === iteration);
  const execution = executions.filter((record) => record.iteration === iteration).at(-1) ?? null;
  const review = reviews.filter((record) => record.iteration === iteration).at(-1) ?? null;
  let phase: WorkflowPhase;
  let nextAction: string;
  if (review?.verdict === "approved") { phase = "done"; nextAction = "任务已通过审查。"; }
  else if (review?.verdict === "blocked") { phase = "blocked"; nextAction = "向用户说明阻塞原因并请求决定。"; }
  else if (review?.verdict === "changes_requested" && iteration + 1 >= task.maxIterations) { phase = "iteration_limit_reached"; nextAction = "已达到迭代上限；获得用户确认后才能继续。"; }
  else if (review?.verdict === "changes_requested") { phase = "changes_requested"; nextAction = `按审查意见修改，并记录第 ${iteration + 1} 次执行。`; }
  else if (execution?.status === "failed") { phase = "execution_failed"; nextAction = "修复执行失败，或将任务标记为阻塞。"; }
  else if (execution?.status === "ok") { phase = "awaiting_review"; nextAction = "请求 Sol 按已绑定证据进行独立审查。"; }
  else if (!planAvailable) { phase = "awaiting_plan"; nextAction = `请求规划第 ${iteration} 次迭代。`; }
  else { phase = "ready_to_execute"; nextAction = "在 Codex 中执行已接受的计划。"; }
  return { task, phase, iteration, maxIterations: task.maxIterations, planAvailable, execution, review, nextAction };
}
