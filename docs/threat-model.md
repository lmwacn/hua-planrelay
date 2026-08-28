# Threat model

This is a lightweight STRIDE-style model for a single-user local gateway and an optional authenticated remote deployment. It is a living document: a feature is not complete until its threats and tests are added here.

## Assets

- source code, proprietary text, and uncommitted diffs;
- credentials accidentally present in a workspace;
- OAuth/session tokens and workspace bindings;
- append-only task, plan, review, and execution-summary records;
- user intent and the integrity of Codex changes;
- availability and resource limits of the local machine.

## Actors and assumptions

| Actor | Trust level | Notes |
| --- | --- | --- |
| Local user | trusted operator | chooses the workspace and approves execution |
| Codex | execution-capable | can edit/run according to its own permissions |
| Connected model | untrusted caller | may be confused, compromised, or prompted by repository text |
| Repository content | untrusted data | may contain prompt injection, links, secrets, or hostile filenames |
| Local same-user process | potentially hostile | can inspect local files/processes depending on OS permissions |
| Remote internet client | hostile | must not reach a gateway without authentication |

Assumptions: the host OS and Node runtime are maintained; the user understands that requested tool output can be sent to a model provider; Codex approvals remain enabled for sensitive operations. The gateway cannot protect against a fully compromised host account.

## Threats and controls

| Threat | Example | Required control | Residual risk |
| --- | --- | --- | --- |
| Spoofing | stolen bearer token calls another workspace | PKCE/OAuth, token audience and workspace binding, short expiry, rotation, revoke | host/browser malware can steal a live session |
| Tampering | model submits a fake/stale review or replayed plan | schema validation, IDs, base-commit and execution-evidence binding, current Git recheck, idempotency, append-only storage | digests establish state identity, not review quality |
| Repudiation | no record of what was reviewed | append-only task/plan/review records; V1 deliberately has no general audit log | coordination records are not a complete or legal audit trail |
| Information disclosure | `.env`, SSH key, or proprietary file returned | built-in denylist, tracked-file default, path guard, byte/line limits, explicit disclosure | secrets embedded in ordinary source can still be returned; V1 has no content redactor |
| Denial of service | huge diff or catastrophic search pattern | timeouts, pagination, max bytes/results, safe search engine, rate limits | local CPU/memory pressure remains possible |
| Elevation of privilege | tool turns text into shell command | no shell/write/commit tools; plans are inert text; Codex approval boundary | an operator can manually execute malicious suggestions |
| Path escape | `../`, absolute path, symlink swap | realpath containment, reject NUL, re-check before read, race-aware open strategy | filesystem races and platform quirks need OS-specific tests |
| Prompt injection | README tells model to upload secrets | treat all workspace text as untrusted; tool description says evidence only; sensitive filters | model may still follow malicious content in allowed files |
| Cross-tenant leak | shared server returns another project | one binding per session, authorization on every call, no global listing, tenant tests | deployment mistakes can defeat application controls |
| Supply-chain compromise | malicious dependency/update | lockfile, CI audit, review release artifacts, signed/checksummed updates | dependency ecosystem risk persists |

## Security invariants

1. A model request can read only policy-approved content under the configured workspace root.
2. A model request cannot cause the gateway to write, execute, commit, push, or alter permissions.
3. Coordination records cannot be interpreted as executable instructions by the gateway.
4. Built-in sensitive paths and absolute state paths do not appear in tool output; secrets embedded in ordinary allowed source remain a disclosed risk.
5. The state store binds records to a workspace. Execution and review records bind filtered Git diff/status and test-summary SHA-256 digests; review publication also recomputes Git evidence to reject stale state.
6. Browser assistance requires explicit user authorization. The Skill never enters passwords, codes, keys, payment information, or recovery data, and stops at authentication/consent boundaries.

## Out of scope

This model does not make guarantees about OpenAI retention, account policy, model behavior, Git hosting, tunneling provider logs, or a compromised operating system. Consult the connected provider’s terms and policy before using sensitive code.

## Review triggers

Update this document before adding write tools, command execution, multi-workspace hosting, browser automation, remote state storage, third-party telemetry, or a new authentication mechanism. Run the negative cases in [testing.md](testing.md) for each such change.
