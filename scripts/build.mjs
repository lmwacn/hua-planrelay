import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["src/cli/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "dist/hua-planrelay.mjs",
  legalComments: "eof",
  metafile: true,
  banner: {
    js: 'import { createRequire as __planrelayCreateRequire } from "node:module"; const require = __planrelayCreateRequire(import.meta.url);',
  },
});

const packages = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  if (!input.includes("node_modules")) continue;
  let directory = path.dirname(path.resolve(input));
  while (directory !== path.dirname(directory)) {
    try {
      const manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
      if (manifest.name && manifest.version) {
        packages.set(`${manifest.name}@${manifest.version}`, { directory, manifest });
        break;
      }
    } catch { /* keep walking to the package root */ }
    directory = path.dirname(directory);
  }
}

const notices = ["Hua PlanRelay — bundled third-party notices", ""];
const components = [];
for (const [identity, { directory, manifest }] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
  const licenseFile = (await readdir(directory)).find((name) => /^(license|licence)(?:[._-].*)?$/i.test(name));
  const licenseText = licenseFile ? (await readFile(path.join(directory, licenseFile), "utf8")).trim() : "License text not bundled; consult the package repository.";
  notices.push("=".repeat(72), identity, `License: ${manifest.license ?? "UNKNOWN"}`, "", licenseText, "");
  components.push({ type: "library", name: manifest.name, version: manifest.version, licenses: [{ license: { id: manifest.license ?? "UNKNOWN" } }], purl: `pkg:npm/${encodeURIComponent(manifest.name)}@${manifest.version}` });
}
await writeFile("dist/THIRD_PARTY_NOTICES.txt", `${notices.join("\n")}\n`, "utf8");
await writeFile("dist/sbom.cdx.json", `${JSON.stringify({ bomFormat: "CycloneDX", specVersion: "1.5", version: 1, metadata: { component: { type: "application", name: "hua-planrelay", version: "0.2.0" } }, components }, null, 2)}\n`, "utf8");
const bundle = await readFile("dist/hua-planrelay.mjs");
await writeFile("dist/SHA256SUMS", `${createHash("sha256").update(bundle).digest("hex")}  hua-planrelay.mjs\n`, "utf8");
