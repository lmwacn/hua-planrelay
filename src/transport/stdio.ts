import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, type PlanRelayServerOptions } from "../mcp/server.js";

export async function serveStdio(options: PlanRelayServerOptions): Promise<void> {
  const server = createMcpServer(options);
  await server.connect(new StdioServerTransport());
}

