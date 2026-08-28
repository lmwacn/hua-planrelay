# Tunnels and deployment

The default is local loopback. A tunnel is an explicit expansion of the trust boundary: it can expose model-requested repository excerpts to a network and adds provider logs, credentials, and availability risks.

## Private development: Secure MCP Tunnel

For a private local server, prefer OpenAI’s [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) when it is available for your account and client. Follow the current OpenAI instructions rather than copying a stale command from this repository. Verify that the tunnel reaches the intended local process and that the MCP endpoint and audience are correct.

This is a development connection, not a substitute for the public HTTPS endpoint and review requirements of a public plugin submission. OpenAI’s [Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt) distinguishes private tunnel testing from public deployment.

## Stable HTTPS deployment

For a shared or public service:

- use a stable domain and valid TLS certificate;
- terminate TLS at a maintained proxy and forward only to the intended gateway;
- bind every token/session to one workspace and explicit scopes;
- implement OAuth 2.1 with PKCE S256, protected-resource metadata, audience/resource validation, expiry, rotation, replay rejection, and revocation;
- apply rate, byte, result-count, and concurrency limits;
- disable directory-wide workspace discovery and cross-tenant state reads;
- keep state and logs in a protected store, with documented retention and deletion;
- monitor authentication failures and abnormal read volume without logging source content;
- pin releases, verify checksums/signatures, and provide a rollback.

Use the current [OpenAI authentication guide](https://developers.openai.com/plugins/build/auth) and [MCP server guide](https://developers.openai.com/plugins/build/mcp-server) when implementing a public endpoint.

## Avoid ephemeral quick tunnels in production

An ephemeral forwarding URL changes identity, complicates allowlists and OAuth redirect/resource validation, and can be accidentally shared. It is acceptable only for short-lived local experiments with test data. Never publish it as the canonical plugin URL.

## Deployment gate

Do not expose a server remotely until [SECURITY.md](../SECURITY.md), [threat-model.md](threat-model.md), [privacy.md](privacy.md), and the negative cases in [testing.md](testing.md) have been reviewed. Public plugin submission additionally requires a stable public HTTPS endpoint and the current OpenAI submission checks; see [publishing.md](publishing.md).
