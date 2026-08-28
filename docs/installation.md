# Installation and local setup

## Before you begin

Use a dedicated test repository first. Remove credentials and production data, decide whether untracked files are needed, and review the [privacy notice](privacy.md). A connected model can receive the content returned by a tool call.

Requirements are Node.js 20/22/24, pnpm 10, and (for Git tools) Git. The package manager is pinned in `package.json`; use a reproducible lockfile install.

## From source

```bash
git clone https://github.com/lmwacn/hua-planrelay.git
cd hua-planrelay
corepack enable
pnpm install --frozen-lockfile
pnpm validate
pnpm build
```

Start a server for one absolute workspace root:

```bash
pnpm dev serve --workspace /absolute/path/to/test-repository
```

Generate connection settings without modifying global configuration:

```bash
hua-planrelay setup --workspace /absolute/path/to/test-repository --json
```

For Secure MCP Tunnel, first create a tunnel in OpenAI Platform settings, then run `hua-planrelay setup --workspace ... --tunnel-id tunnel_... --json`. The output is an argument vector so paths containing spaces remain unambiguous. Keep the runtime API key in the shell; never place it in the repository or command output.

The built CLI can be invoked as `node dist/hua-planrelay.mjs --help` or through the package binary after packaging. Always check `hua-planrelay --help` because options may evolve before `1.0.0`.

## Local state

Set the application state directory outside the checkout when the implementation supports it:

```bash
export PLANRELAY_STATE_DIR="$HOME/.local/state/hua-planrelay"
chmod 700 "$PLANRELAY_STATE_DIR"
```

On macOS and Windows, use the platform’s per-user application-data directory with equivalent permissions. Do not commit state, access tokens, authorization codes, tunnel credentials, or logs. Backups of that directory are sensitive.

## Local MCP connection

Keep the gateway on loopback and connect the MCP client to the endpoint printed by the CLI. For a ChatGPT personal connection, enable Developer mode in ChatGPT settings, add the endpoint in the personal Plugins directory, and verify the displayed tool names and read-only behavior. Current UI steps are in the [OpenAI Plugins quickstart](https://developers.openai.com/plugins/quickstart).

For Codex, install the local plugin metadata only after reviewing `.codex-plugin/plugin.json` and `.mcp.json`; do not copy a remote endpoint into a local configuration without checking its owner and TLS certificate.

## First-run checklist

1. Bind a disposable test checkout, not your home directory.
2. Call `workspace_info` and verify the opaque workspace alias, repository identity, policy, and tracked-file mode. Public-facing fields intentionally omit the absolute path and internal workspace ID.
3. Read a harmless fixture and verify size/line limits.
4. Confirm `.env`, private keys, cloud credentials, and state files are denied.
5. Try `../outside.txt` and a symlink to an outside file; both must fail.
6. Verify the gateway has no write, shell, commit, or push tool.
7. Stop the process and confirm the state directory contains no secret or full source dump.
8. Create a disposable task and use `hua-planrelay status --task <id> --json` to verify the phase and iteration limit.

## Troubleshooting

- **No tools appear:** check that the endpoint is reachable, the MCP path is correct, the server is running, and the client supports Streamable HTTP or the configured transport.
- **A file is denied:** inspect the built-in sensitive-file policy and project ignore rules; do not disable built-in protections to make a request convenient.
- **Git tools report no repository:** confirm the bound root is the checkout root and that `git status --porcelain` works locally.
- **Remote connection fails:** test locally first, then review [tunnels.md](tunnels.md), TLS, authentication discovery, and provider account restrictions.
- **Build differs on machines:** use the pinned pnpm version and `--frozen-lockfile`; inspect CI’s Node matrix.
