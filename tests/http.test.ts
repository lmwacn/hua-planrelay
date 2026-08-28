import { request } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { startHttpServer } from "../src/transport/http.js";

const cleanups: string[] = [];
afterEach(async () => { await Promise.all(cleanups.splice(0).map((item) => rm(item, { recursive: true, force: true }))); });

function get(port: number, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path: "/health", headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("loopback HTTP boundary", () => {
  it("returns a minimal health response and rejects rebinding hosts/origins", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "hua-planrelay-http-"));
    const state = await mkdtemp(path.join(os.tmpdir(), "hua-planrelay-http-state-"));
    cleanups.push(root, state);
    const server = await startHttpServer({ workspaceRoot: root, stateDir: state, trackedFilesOnly: false, port: 0 });
    try {
      const port = (server.address() as AddressInfo).port;
      expect(await get(port)).toEqual({ status: 200, body: "{\"ok\":true}" });
      expect((await get(port, { host: "attacker.example" })).status).toBe(403);
      expect((await get(port, { origin: "https://attacker.example" })).status).toBe(403);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
