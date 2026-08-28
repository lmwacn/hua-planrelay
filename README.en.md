# Hua PlanRelay

[简体中文](README.md) · **English**

> **Sol thinks. Luna coordinates. Codex executes.**

Hua PlanRelay is a local coding-workflow bridge. Luna stays on the Codex side for high-frequency coordination, context preparation, local edits, and verification. When the account supports it, genuinely difficult planning and review can be handed to Sol in the browser. The two sides exchange a bounded read-only workspace view and structured records rather than copying entire conversations or sharing execution authority.

The core idea is inspired by [Codex with ChatGPT](https://github.com/XiaoDuoYa/codex-with-chatgpt). Hua PlanRelay is an independent implementation with an explicit distinction between current capabilities and the intended end-state workflow.

> **Status:** `0.1.x` implements the secure local read-only bridge, CLI, plugin, and plan/review protocol. “Luna automatically operates Sol in the browser” remains a product direction, not a capability already delivered by this release.

## The problem it addresses

Complex coding work mixes two different kinds of effort:

- **high-frequency execution:** reading status, preparing context, editing files, running tests, and handling Git;
- **high-value reasoning:** decomposing difficult requirements, choosing an architecture, finding failure modes, and independently reviewing the result.

Using the most capable model continuously means routine coordination can consume the same scarce allowance as the hard reasoning. Hua PlanRelay routes work by task shape:

| Role | Best suited for | Should not do |
| --- | --- | --- |
| **Luna / Codex** | frequent coordination, tool-result handling, local edits, tests, iteration | own every deep planning step merely because it can |
| **Sol in the browser** | difficult planning, architecture trade-offs, failure analysis, independent review | receive shell, file-write, commit, or push authority |
| **PlanRelay** | expose bounded context and relay plans/reviews | execute commands or bypass product limits |

### How it may reduce usage

Moving planning and review out of a long-running high-capability Codex session and into an available ChatGPT web model **may** reduce the amount of high-capability Codex usage spent on reasoning. Using Luna for frequent coordination also matches its cost-sensitive, high-volume positioning.

This is not a free-quota converter, and it cannot guarantee lower total usage. Whether ChatGPT web, Work, Codex, and individual models share allowances, use separate limits, or draw credits depends on the plan, workspace settings, and current product rules. Treat the Usage screen in your account as authoritative. See OpenAI's [GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model) for the current Sol/Luna positioning.

## How it works

```text
             ┌──────────────────────────────┐
             │ ChatGPT / Sol in the browser │
             │ deep planning · design · review │
             └──────────────┬───────────────┘
                            │ read-only MCP: bounded context
                            │ structured Plan / Review records
                            ▼
             ┌──────────────────────────────┐
             │        Hua PlanRelay         │
             │ path guard · secret filtering · paging │
             └──────────────┬───────────────┘
                            │ local handoff
                            ▼
             ┌──────────────────────────────┐
             │ Luna / Codex                 │
             │ edit · shell · test · Git    │
             └──────────────┬───────────────┘
                            ▼
                       local workspace
```

- **Data plane:** read-only access to one bound workspace; there are no write, shell, commit, or push tools.
- **Control plane:** plans, execution summaries, and reviews are append-only records outside the repository.
- **Review loop:** Sol can inspect the real diff and test summary before approving, requesting changes, or blocking.
- **Browser boundary:** V1 uses a user-mediated browser handoff. Future Luna-driven browser assistance must require explicit user authorization and preserve login, CAPTCHA, and external-action boundaries.

## What exists today

| Implemented in `0.1.x` | Product direction |
| --- | --- |
| 10 workspace, Git, task, plan, and review MCP tools | user-authorized Luna assistance for the browser/Sol handoff |
| stdio and loopback-only HTTP transports | stable HTTPS, OAuth, and revocable remote connections |
| traversal, symlink, sensitive-path, and size controls | a more complete one-paste setup and visual status experience |
| Codex plugin, Skill, CLI, and append-only state | diff/test evidence digests and stronger review binding |

Read [the architecture](docs/architecture.md), [protocol](docs/protocol.md), and [threat model](docs/threat-model.md) before using it with sensitive work.

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

## Shortest working flow

The current release is not a “paste one sentence and let it control the browser” system. It provides an inspectable workflow that can be connected step by step:

1. Create a task for the local project:

   ```bash
   pnpm dev task create \
     --workspace /absolute/path/to/project \
     --goal "Add login rate limiting and tests" \
     --json
   ```

2. Start the read-only gateway and connect the plugin as described in [installation](docs/installation.md). Prefer OpenAI Secure MCP Tunnel when the web client must reach the local gateway.
3. In ChatGPT in the browser, select Sol when it is available to the account and send: `Plan the current Hua PlanRelay task.`
4. Luna / Codex reads the plan, edits locally, runs tests, and records a structured execution summary.
5. In the same browser conversation, send: `Review the current Hua PlanRelay task.` Sol inspects the real diff and test summary through MCP.
6. Apply findings until the result is approved or genuinely blocked.

In the intended end state, Luna can assist with steps 3 and 5 after explicit user authorization. Login, CAPTCHA, two-factor authentication, and other external actions remain with the user.

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
