#!/usr/bin/env node
import { buildCli } from "../dist/hua-planrelay.mjs";

buildCli().parseAsync().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "command failed"}\n`);
  process.exitCode = 1;
});
