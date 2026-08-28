import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer, type PlanRelayServerOptions } from "../mcp/server.js";

export const DEFAULT_MCP_PATH = "/mcp";
export const DEFAULT_HTTP_HOST = "127.0.0.1";

export type HttpTransportOptions = PlanRelayServerOptions & {
  host?: string;
  path?: string;
};

function endpoint(value: string | undefined): string {
  if (!value) return DEFAULT_MCP_PATH;
  const normalized = value.startsWith("/") ? value : `/${value}`;
  if (normalized.length > 128 || normalized.includes("..") || !/^\/[A-Za-z0-9/_-]+$/.test(normalized)) throw new Error("invalid MCP endpoint path");
  return normalized.replace(/\/{2,}/g, "/");
}

function isLoopback(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::ffff:127.0.0.1";
}

function validLocalHost(value: string | undefined): value is string {
  if (!value || !/^127\.0\.0\.1(?::\d{1,5})?$/.test(value)) return false;
  const port = value.includes(":") ? Number(value.slice(value.lastIndexOf(":") + 1)) : 80;
  return Number.isInteger(port) && port > 0 && port <= 65_535;
}

function validLocalOrigin(value: string | undefined): boolean {
  if (!value) return true;
  try {
    const origin = new URL(value);
    return origin.protocol === "http:" && origin.hostname === "127.0.0.1" && origin.origin === value;
  } catch { return false; }
}

function generic(res: ServerResponse, status: number, body: object): void {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

/** Create a stateless Streamable HTTP MCP server. It intentionally has no session ID. */
export function createHttpServer(options: HttpTransportOptions): Server {
  const host = options.host ?? DEFAULT_HTTP_HOST;
  if (host !== DEFAULT_HTTP_HOST) throw new Error("Hua PlanRelay HTTP transport only binds to 127.0.0.1");
  const mcpPath = endpoint(options.path);
  return createServer((req, res) => {
    void handleRequest(req, res, options, mcpPath);
  });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, options: HttpTransportOptions, mcpPath: string): Promise<void> {
  if (!isLoopback(req.socket.remoteAddress)) {
    generic(res, 403, { error: "local access required" });
    return;
  }
  const hostHeader = req.headers.host;
  const originHeader = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  if (!validLocalHost(hostHeader) || !validLocalOrigin(originHeader)) {
    generic(res, 403, { error: "local host required" });
    return;
  }
  const requestPath = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
  if (requestPath === "/health") {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    // Deliberately do not include workspace path, workspace ID, process details, or version.
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (requestPath !== mcpPath) {
    generic(res, 404, { error: "not found" });
    return;
  }
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      allowedHosts: [hostHeader],
      ...(originHeader ? { allowedOrigins: [originHeader] } : {}),
      enableDnsRebindingProtection: true,
    });
    const mcp = createMcpServer(options);
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
  } catch {
    generic(res, 500, { error: "MCP request failed" });
  }
}

export async function startHttpServer(options: HttpTransportOptions & { port?: number }): Promise<Server> {
  const host = options.host ?? DEFAULT_HTTP_HOST;
  if (host !== DEFAULT_HTTP_HOST) throw new Error("Hua PlanRelay HTTP transport only binds to 127.0.0.1");
  const server = createHttpServer(options);
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => { server.off("listening", onListening); reject(error); };
    const onListening = () => { server.off("error", onError); resolve(); };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(options.port ?? 8787, DEFAULT_HTTP_HOST);
  });
  return server;
}
