# Security policy

Hua PlanRelay is an early-stage independent open-source project. Please do not report a vulnerability in a public issue when it could expose source code, credentials, tokens, or an exploitable endpoint.

## Supported versions

Only the latest release on the default branch is currently supported. Development snapshots may contain known vulnerabilities and must not be exposed to untrusted networks.

## Reporting a vulnerability

Preferred channel: use GitHub’s **Report a vulnerability** feature for [lmwacn/hua-planrelay](https://github.com/lmwacn/hua-planrelay/security/advisories/new). If private reporting is unavailable, contact the repository maintainer through the private contact configured in the GitHub security page. Do not include real secrets or private source in the initial report.

Include:

- affected version/commit and operating system;
- a minimal reproduction using synthetic data;
- impact and required access;
- logs or traces with tokens, paths, and source content redacted;
- a suggested mitigation if you have one.

We aim to acknowledge reports within 7 days, provide an initial severity assessment within 14 days, and coordinate a fix or disclosure timeline with the reporter. These are goals, not a guaranteed SLA.

## Scope

High-priority reports include workspace boundary escapes, secret disclosure, authentication or workspace-confusion bugs, unsafe HTML, remote code execution, cross-session state access, and supply-chain/release compromise. Reports about provider retention, ChatGPT/Codex limits, model behavior, or a third-party tunnel should be sent to that provider as well.

## Safe testing

Use a disposable repository and fake credentials. Do not run tests against another person’s workspace, attempt denial of service, or access data without permission. See [the threat model](docs/threat-model.md) and [negative test cases](docs/testing.md).

## Disclosure

We will credit reporters who want credit, subject to their preference. A fix should include a regression test, an update to the threat model, and a changelog entry when appropriate.
