# Testing and release gates

The goal is to prove the security boundary, not merely that a tool returns a happy-path string. Keep a small fixture repository with harmless fake secrets and files outside the workspace. Do not put real credentials in tests or CI.

## Required positive cases

- `workspace_info` returns the configured policy and opaque root aliases without exposing either an absolute path or the internal workspace ID.
- `list_files` returns bounded, deterministic results and respects tracked-file mode.
- `read_file_range` reads an allowed text range and enforces byte/line limits.
- `search_text` returns bounded matches, handles empty results, and does not evaluate a regular expression supplied as an executable program.
- `git_status` and `git_diff` report a real repository, base revision, truncation, and changed paths accurately.
- `test_summary` returns an explicit recorded/known status and does not invent a passing result.
- A valid plan/review record round-trips, is append-only, and can be retried with the same idempotency key.
- ChatGPT/Codex can discover tools over the configured local or secure tunnel transport.

## Required negative cases

| Area | Cases |
| --- | --- |
| Paths | `../outside`, absolute paths, Windows drive/UNC paths, NUL bytes, Unicode normalization, dot segments |
| Links/races | file and directory symlinks outside root; replace a link between validation and open |
| Sensitive data | `.env`, `.npmrc`, `.netrc`, SSH/GPG keys, cloud/Kubernetes config, service-account JSON, Terraform state, cookies, certificates, fake token patterns |
| Bounds | empty/huge files, long lines, huge diff, deep tree, too many results, invalid pagination, timeout/cancellation |
| Git | non-repository root, detached HEAD, missing base, binary diff, rename/delete, permission error, hostile filename |
| Protocol | unknown type/version, malformed JSON, duplicate ID with changed payload, stale evidence, concurrent append, invalid transition |
| Workflow | missing plan/execution, approved/blocked verdict, stale Git state, mismatched digest, iteration limit |
| Browser Skill | no consent, login/CAPTCHA/2FA pause, unavailable Sol, one-message bound, stop states |
| Auth | missing/expired token, wrong audience/resource, wrong workspace/scope, revoked token, refresh replay, unregistered redirect URI |
| Injection | README/source asks the model to reveal secrets, follow a URL, run a command, or ignore the system policy |
| Web | HTML metacharacters in project names/errors, unsafe origin, missing CSP, invalid CORS, oversized request body |
| Boundary | confirm no MCP tool can write, execute, commit, push, change permissions, or read application state outside its API |

## Commands and CI expectations

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm validate
```

CI runs these checks on Node 20, 22, and 24 with a frozen pnpm lockfile. Secret scanning runs independently on the full Git history available to the workflow. A release is blocked on type errors, test failures, build failures, detected secrets, or an unexplained security-test regression.

## End-to-end plugin evaluation

First inspect and call each tool directly with representative and edge-case inputs; then connect the complete plugin. Preserve prompts and results across releases so behavior can be compared. Confirm tool names, schemas, annotations, authentication discovery, error messages, confirmation behavior, and model-readable output. Follow [OpenAI’s plugin connection/testing guide](https://developers.openai.com/plugins/deploy/connect-chatgpt) and [MCP server guide](https://developers.openai.com/plugins/build/mcp-server).

## Release evidence

Attach to each release:

- supported Node/pnpm versions;
- test/typecheck/build output;
- dependency and secret-scan results;
- the tested transport and authentication mode;
- known limitations and changed threat-model assumptions;
- checksums (and signatures when configured) for published artifacts.
