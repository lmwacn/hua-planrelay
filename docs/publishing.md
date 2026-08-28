# Publishing and release process

This project is published at [github.com/lmwacn/hua-planrelay](https://github.com/lmwacn/hua-planrelay). The repository and plugin metadata must continue to identify Hua PlanRelay as an independent project; do not use OpenAI logos, imply endorsement, or describe it as a quota bypass.

## Before the first public release

- replace placeholder author, support, security, privacy, terms, and repository URLs in plugin metadata;
- provide a stable public HTTPS MCP endpoint only if a hosted deployment is actually maintained;
- make `privacy.md` and `terms.md` reachable at the deployed URLs;
- verify OAuth discovery, PKCE S256, resource/audience validation, scope/workspace binding, rotation, replay rejection, and revocation;
- publish the supported tool list, schemas, annotations, limits, and known data flows;
- run the positive and negative suite in [testing.md](testing.md);
- run `pnpm validate` on Node 20, 22, and 24, plus secret/dependency scans;
- review the complete plugin in ChatGPT developer mode and retain evaluation prompts/results;
- publish checksums/SBOM and a rollback procedure;
- document the operator’s retention, deletion, incident response, and support process.

OpenAI’s current [Plugins quickstart](https://developers.openai.com/plugins/quickstart), [authentication guide](https://developers.openai.com/plugins/build/auth), [connection/testing guide](https://developers.openai.com/plugins/deploy/connect-chatgpt), and [submission guide](https://developers.openai.com/plugins/deploy/submission) are authoritative for OpenAI-side requirements. Account availability and submission criteria can change.

## Versioning

Use SemVer after the first stable API. Until `1.0.0`, breaking changes may occur but must be called out in `CHANGELOG.md`. Tag releases from reviewed commits; do not silently pull `main`, auto-stash user work, or run unreviewed update scripts.

Recommended release sequence:

1. merge reviewed code and documentation;
2. run the full release gate and record evidence;
3. update `CHANGELOG.md` and package/plugin versions;
4. create a signed or protected Git tag and GitHub release;
5. upload artifacts, checksums, and SBOM;
6. verify installation from a clean directory;
7. announce known limitations and provide rollback instructions.

## GitHub settings

Enable branch protection for the default branch, required CI, CODEOWNERS review for security-sensitive paths, Dependabot (or equivalent), secret scanning, and issue templates that warn users not to paste private code or credentials. Keep workflow permissions read-only by default.

## OpenAI directory submission

Do not submit a placeholder local-only endpoint. Submission is optional and separate from open-source publication. If submitted, provide the stable endpoint, privacy policy, terms, support contact, authentication metadata, tool evaluations, and requested verification. A passing submission does not change the project’s independent status or the provider disclosure in [privacy.md](privacy.md).
