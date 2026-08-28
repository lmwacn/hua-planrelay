# Privacy notice

Last updated: 2026-08-29

Hua PlanRelay is an independent open-source project. It is not operated by OpenAI. This notice describes the reference application; a deployment owner is responsible for its own public privacy notice, retention settings, tunnel logs, and legal obligations.

## What is processed

When enabled, the gateway may process locally:

- workspace-relative file names, Git metadata, bounded file excerpts, search matches, diff hunks, and test summaries requested by a connected client;
- configuration, workspace/session identifiers, and append-only plan/review/status records;
- append-only task, plan, review, and structured execution-summary records. The V1 reference implementation does not emit a general operational/audit log.

The service should not collect unrelated directories, whole-repository indexes, or credentials by default. Built-in sensitive-file exclusions are a safety layer, not a promise that every secret format is detected.

## What may leave the machine

If a model client calls a read tool, the requested arguments and returned content can leave the machine and be processed by the model provider or transport provider. For example, a bounded code excerpt may be sent to ChatGPT to answer a planning or review request. Hua PlanRelay does not claim that a repository is never uploaded and does not control provider retention, training, regional processing, or account policy.

Before connecting, inspect the requested file scope and provider policy. Do not connect regulated, confidential, or production workspaces unless your organization has approved that flow.

## Local storage and deletion

The application state directory is outside the workspace and should be protected by the operating system. It contains an installation salt and task/plan/review/execution-summary records. A remote deployment may add session metadata. The deployment should document its exact path and retention policy, provide a way to revoke remote sessions when applicable, and allow the user to delete local state after stopping the gateway. Deleting local records does not delete provider-side request history or tunnel logs.

If a deployment adds logs, they should be short-lived, redacted, and disabled or minimized in production. Never log access tokens, refresh tokens, authorization codes, full file contents, or full diffs by default.

## Choices and responsibilities

- Choose which workspace to bind and whether to allow untracked files.
- Add project-specific deny patterns to tighten the built-in policy.
- Stop the gateway and revoke remote sessions when finished.
- Review diffs and tests in Codex; a model review is advisory.
- Keep provider, tunnel, and hosting disclosures alongside this notice for a public deployment.

Questions and deletion requests for a hosted instance should be sent to that instance’s operator. The GitHub repository maintainer can address source-code issues through [SECURITY.md](../SECURITY.md), but cannot delete data held by a separate provider.

For current plugin connection and safety expectations, consult OpenAI’s [Plugins security and privacy guidance](https://developers.openai.com/plugins/guides/security-privacy) and [Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt).
