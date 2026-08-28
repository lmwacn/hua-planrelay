# Coordination protocol

This document defines the application-level contract between ChatGPT, Codex, and the PlanRelay gateway. MCP transport and tool schemas are the wire interface; this protocol governs records exchanged through the application state directory.

## Versioning

Records use `version: 1`. Unknown fields are rejected by the current strict schemas; clients should not depend on adding fields until a protocol version explicitly allows them. Unknown record types and invalid transitions must be rejected. The `idempotency` value is the client-supplied identity for one task/iteration/kind. Timestamps are UTC Unix seconds.

## Record envelope

Each record is a strict JSON object. Its common fields are:

```json
{
  "version": 1,
  "type": "task",
  "task_id": "task-2026-001",
  "iteration": 0,
  "baseCommit": "abc1234",
  "idempotency": "initial-task",
  "createdAt": 1777334400
}
```

The workspace binding is held by the store and is not copied into each record. Its identifier is an opaque HMAC-derived value in the application state path; an absolute workspace path must never be used as a public identifier. The current implementation stores one immutable JSON file per identity in the state directory, giving append-only semantics (existing content cannot be overwritten with different content).

## Plan record

```json
{
  "version": 1,
  "type": "plan",
  "task_id": "task-2026-001",
  "iteration": 0,
  "baseCommit": "abc1234",
  "idempotency": "plan-1",
  "createdAt": 1777334400,
  "steps": [
    {"id":"step-1","title":"Add schema validation","description":"Reject malformed input", "files":["src/http/input.ts"],"verification":"Add regression test"}
  ],
  "summary": "Validate the request boundary and cover the regression."
}
```

`publish_plan` requires an existing task with the same `task_id` and matching `baseCommit`. Descriptions and `files` are plain-text hints. They are not shell commands, patches, file-write instructions, or authorization, and the gateway never interprets them as paths to read. The Codex operator must inspect the plan and approve or adapt it before making changes.

## Review record

```json
{
  "version": 1,
  "type": "review",
  "task_id": "task-2026-001",
  "iteration": 0,
  "baseCommit": "abc1234",
  "idempotency": "review-1",
  "createdAt": 1777334400,
  "verdict": "changes_requested",
  "summary": "Validation is present; one boundary case remains.",
  "findings": [
    {"severity":"high","title":"Null input is not covered","detail":"Add a regression test and guard","path":"src/http/input.ts"}
  ]
}
```

Finding and plan paths are descriptive strings and are not authorization. A review may quote a bounded excerpt, but should prefer a reference and digest. Do not put credentials or full files into a record.

## State transitions and concurrency

Tasks establish a base commit; valid operational transitions are `INIT → CONTEXT_READY → PLAN_PUBLISHED → EXECUTING → REVIEW_READY → DONE`; any stage may append `BLOCKED`. A client must use an idempotency key when retrying a publish. The server rejects the same identity with different content, and uses atomic creation so a partial write cannot be read as a valid record.

Two clients can publish concurrently. Consumers order by `(createdAt, type)` for display only; they must never infer authorization from ordering. A stale plan is detected by comparing its recorded `baseCommit` and current Git status/diff before execution.

## MCP tool rules

Read tools return a bounded, structured result and a human-readable summary. Errors must not echo tokens, absolute state paths, or untrusted HTML. Coordination tools accept only schema-defined fields and return the new record ID. They must not accept `command`, `script`, `patch`, `url`, or an arbitrary filesystem path.

Tool descriptions should make side effects explicit and should carry the MCP SDK’s read-only annotations where available. Follow the current [OpenAI MCP server guidance](https://developers.openai.com/plugins/build/mcp-server) when packaging and testing the server.
