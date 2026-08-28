# Architecture

Hua PlanRelay separates the agent that can change a repository from the model that can inspect it. The gateway is a policy enforcement point, not an execution agent.

## Components

```text
┌───────────────────────┐        MCP / HTTPS        ┌──────────────────────┐
│ ChatGPT (plan/review) │ ◄────────────────────────► │ PlanRelay gateway     │
└───────────────────────┘                           │ - local transport     │
                                                   │ - schema/size limits  │
┌───────────────────────┐                           │ - path/symlink guard  │
│ Codex (edit/execute)  │ ───── local process ─────► │ - bounded filtering  │
└───────────────────────┘                           └──────────┬───────────┘
                                                              │ read only
                                      append only              ▼
                               ┌────────────────┐       ┌──────────────┐
                               │ app state dir  │       │ workspace    │
                               │ plans/reviews  │       │ one root     │
                               └────────────────┘       └──────────────┘
```

### Workspace data plane

The gateway receives one canonical workspace root at startup. Every requested path is resolved, normalized, and checked to remain under that root. Read tools may expose bounded names, metadata, snippets, search matches, Git status, diff hunks, and test summaries. They do not modify files, spawn a shell, commit, push, or accept a model-provided command.

The gateway should default to tracked files and a built-in sensitive-file denylist. A repository-specific ignore file can further restrict reads, but cannot remove the built-in denylist.

### Coordination control plane

Plans, reviews, and lifecycle events are application records outside the workspace. Records are append-only and schema-validated. They carry intent and evidence—not shell commands, patches, or permission grants. Codex remains responsible for deciding whether and how to implement a plan.

The state directory must be permission-restricted to the local user, excluded from Git, and configurable for managed environments. State records should contain a workspace identifier rather than publishing the absolute path or a secret.

### Transport and trust boundaries

- Local development: loopback HTTP/Streamable HTTP or stdio as supported by the MCP host.
- Private remote development: a managed secure MCP tunnel.
- Shared/public operation: stable HTTPS, a documented origin, authentication, rate limits, and explicit workspace binding.

TLS protects transport but does not make repository content safe to disclose. The caller and model provider remain outside the local trust boundary. Treat tool arguments, repository text, Git metadata, and model-produced plans as untrusted input.

## Lifecycle

```text
INIT → CONTEXT_READY → PLAN_PUBLISHED → EXECUTING → REVIEW_READY → DONE
                         │                                  │
                         └────────────── BLOCKED ◄──────────┘
```

The `workflow_status` tool and `status` CLI derive these phases from append-only records. Each task has a 1–20 iteration limit (default 3). Execution records bind the task base commit, current head, filtered diff/status SHA-256 digests, and test-summary digest. `publish_review` requires the exact evidence object and rejects it when the current Git state no longer matches.

Browser assistance is an orchestration behavior in the Codex Skill, not an execution capability in the MCP gateway. It is available only when the host exposes browser control and the user explicitly authorizes it for the current request. The Skill sends one bounded prompt per plan/review stage and stops for authentication, CAPTCHA, 2FA, unavailable Sol, blocks, or the iteration limit.

## Non-goals

- no automatic whole-repository indexing or upload;
- no remote code execution through MCP;
- no promise of privacy beyond the configured policy and the connected provider’s terms;
- no quota, billing, or account-limit manipulation;
- no claim of OpenAI affiliation or official plugin status.

## Extension rules

New tools require a threat-model entry, a schema, explicit read/write and network annotations, limits, sensitive-data tests, and documentation. Any tool that can modify a workspace or execute a command belongs in a separately permissioned Codex-side component; it must not be added to the read-only model gateway by convenience.

For MCP/plugin architecture and current connection behavior, see the [OpenAI Plugins quickstart](https://developers.openai.com/plugins/quickstart), [MCP server guide](https://developers.openai.com/plugins/build/mcp-server), and [Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt).
