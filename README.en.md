# Hua PlanRelay

[简体中文](README.md) · **English**

**ChatGPT plans and reviews. Codex changes and verifies.**

Hua PlanRelay is an independent, open-source bridge for a local coding workflow. It gives ChatGPT a narrow, read-only view of one workspace so ChatGPT can help make a plan and review a diff, while Codex remains the agent that edits files, runs commands, and controls Git.

> **Status:** early development (`0.1.x`). The local gateway and protocol are the primary target. Remote/public plugin packaging is not implied by a local install and must be reviewed separately.

## What it is — and is not

Hua PlanRelay is:

- a workspace-scoped MCP server;
- a read-only code, Git-status, diff, search, and test-summary surface for a model;
- an append-only coordination log stored outside the repository;
- a set of Codex/plugin instructions for a plan → execute → review workflow.

It is **not** an OpenAI product, an OpenAI-operated service, or a quota workaround. It does not promise to reduce, avoid, or bypass ChatGPT/Codex limits. Availability, limits, retention, and account controls are determined by the product and account used.

It also does not promise that “the repository is never uploaded.” When a connected model calls a read tool, the requested file names, metadata, or code excerpts can be sent to that model provider. Do not connect a workspace unless that disclosure is acceptable to you.

## Workflow

```text
User task
   │
   ├── ChatGPT: inspect selected context → produce a structured plan
   │
   ├── Codex: review/approve plan → edit files, run commands, test
   │
   └── ChatGPT: inspect status/diff/test summary → publish review
```

The gateway has two deliberately separate surfaces:

1. **Workspace data plane:** read-only access under one configured root. No write-file, shell, commit, push, or arbitrary-path tool is exposed.
2. **Coordination control plane:** append-only plan/review/status records in the application state directory. These records cannot write to the repository and do not contain executable commands.

See [the architecture](docs/architecture.md), [protocol](docs/protocol.md), and [threat model](docs/threat-model.md) before exposing a server beyond localhost.

## Requirements

- Node.js 20, 22, or 24
- pnpm 10 (the repository pins a Node 20-compatible package manager version)
- a local Git checkout for Git tools
- ChatGPT/Codex access that supports the relevant MCP/plugin surface, if you use the integration

## Install and run locally

```bash
git clone https://github.com/lmwacn/hua-planrelay.git
cd hua-planrelay
corepack enable
pnpm install --frozen-lockfile
pnpm validate
pnpm build
```

Run the local gateway for a workspace:

```bash
pnpm dev serve --workspace /absolute/path/to/project
```

Use `hua-planrelay --help` (or `pnpm dev --help` while developing) for the installed CLI’s exact options. Prefer an absolute workspace path. Keep the server bound to loopback for local use.

The implementation may choose a platform-specific state directory. Set an explicit application state directory when supported, for example:

```bash
export PLANRELAY_STATE_DIR="$HOME/.local/state/hua-planrelay"
```

Never place tokens, state logs, or local configuration inside the repository. See [installation](docs/installation.md) for a complete local and remote setup, and [tunnels](docs/tunnels.md) before using a public HTTPS endpoint.

## ChatGPT/Codex connection

For a personal development connection, use ChatGPT developer mode or the supported Codex plugin flow and point it at the MCP endpoint produced by the gateway. The exact UI and account availability are controlled by OpenAI and may change; follow the current [OpenAI Plugins quickstart](https://developers.openai.com/plugins/quickstart) and [Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt).

For remote access:

- prefer OpenAI’s [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) for private development;
- use a stable HTTPS origin and an authenticated deployment for a shared/public service;
- do not use an ephemeral quick tunnel as a production identity;
- do not expose a local gateway without authentication, an explicit workspace binding, and TLS.

Hua PlanRelay’s plugin metadata is a convenience for development. It does not make the project an official OpenAI plugin, and it does not guarantee acceptance into any OpenAI directory. Review [publishing](docs/publishing.md) before submitting anything.

## Tool contract (initial target)

The initial read-only tools are intentionally small:

| Tool | Purpose | May return code/content? |
| --- | --- | --- |
| `workspace_info` | opaque workspace alias, repository identity, policy summary | No source by default; no absolute path |
| `list_files` | bounded file listing | names and metadata |
| `read_file_range` | bounded line/byte range | Yes, filtered |
| `search_text` | bounded text search | matching excerpts, filtered |
| `git_status` | working-tree summary | paths/status only |
| `git_diff` | bounded diff | changed hunks, filtered |
| `test_summary` | recorded/explicit test summary | summary only |
| `current_task` | read the latest task, plans, and reviews | records only |
| `publish_plan` | append a validated plan outside the workspace | no workspace write |
| `publish_review` | append a validated review outside the workspace | no workspace write |

The coordination tools are restricted to validated append-only records. They must not accept shell commands or arbitrary file paths. `publish_plan` and `publish_review` require a previously recorded task and matching base commit; the CLI/state adapter is responsible for creating the task record.

All tool inputs and outputs must be schema-validated, bounded, and annotated. A model-readable result is evidence, not permission to edit or execute. The current MCP implementation is the source of truth; this table describes the contract we intend to preserve.

## Safety defaults

- One server instance binds to one workspace root.
- Root containment is checked after path resolution; traversal and symlink escapes are rejected.
- Built-in sensitive-file exclusions cannot be relaxed by a repository ignore file.
- Prefer tracked files (`git ls-files`) for model reads; opt in to untracked reads only when needed.
- Large files, deep listings, searches, and diffs are bounded and paginated.
- Prompt injection in repository content is treated as untrusted data, not an instruction.
- Hua PlanRelay does not emit an audit log in V1. Built-in secret-file paths and absolute state paths are excluded, but secrets embedded in ordinary allowed source can still be returned.
- Updates are versioned and user-approved; the project must not silently pull or stash a working tree.

These are design requirements, not a guarantee that every future deployment is safe. Read [SECURITY.md](SECURITY.md) and [privacy](docs/privacy.md).

## Development

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm validate
```

Test cases, including required positive and negative coverage, are in [testing.md](docs/testing.md). Contributions should keep the read-only boundary and update the relevant docs when behavior changes; see [CONTRIBUTING.md](CONTRIBUTING.md).

## License and attribution

Hua PlanRelay is released under the MIT License. It is an independent implementation inspired by common plan/execute/review agent workflows. It is not affiliated with, endorsed by, or sponsored by OpenAI. Third-party notices are in [NOTICE](NOTICE).

## Documentation map

- [简体中文 README](README.md)
- [Architecture](docs/architecture.md)
- [Protocol](docs/protocol.md)
- [Threat model](docs/threat-model.md)
- [Privacy](docs/privacy.md)
- [Installation](docs/installation.md)
- [Tunnels and deployment](docs/tunnels.md)
- [Testing and release gates](docs/testing.md)
- [Publishing](docs/publishing.md)
- [Changelog](CHANGELOG.md)
