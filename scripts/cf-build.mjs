// Builds the Worker bundle. On Windows, OpenNext recreates the symlinks that
// Next's standalone output uses for external packages; plain directory
// symlinks need Developer Mode there, so this swaps in a junction fallback
// before running the build. No-op on other platforms.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const target = "node_modules/@opennextjs/aws/dist/build/copyTracedFiles.js";
if (process.platform === "win32" && existsSync(target)) {
  let src = readFileSync(target, "utf8");
  const needle = "                symlinkSync(symlink, to);\n";
  const patched =
    "                try { symlinkSync(symlink, to); } catch (err) {\n" +
    "                    if (err.code !== \"EPERM\") throw err;\n" +
    "                    symlinkSync(path.resolve(path.dirname(from), symlink), to, \"junction\");\n" +
    "                }\n";
  if (src.includes(needle)) {
    src = src.replace(needle, patched);
    writeFileSync(target, src);
    console.log("cf-build: patched OpenNext symlink handling for Windows");
  }
}
// OpenNext 1.20.x does not yet inline Next 16.4's preview-props.json manifest.
const lm = "node_modules/@opennextjs/cloudflare/dist/cli/build/patches/plugins/load-manifest.js";
if (existsSync(lm)) {
  let src = readFileSync(lm, "utf8");
  const from = "{*-manifest,required-server-files,prefetch-hints}.json";
  if (src.includes(from)) {
    writeFileSync(lm, src.replace(from, "{*-manifest,required-server-files,prefetch-hints,preview-props}.json"));
    console.log("cf-build: patched OpenNext manifest list for Next 16.4");
  }
}
const r = spawnSync("npx.cmd", ["opennextjs-cloudflare", "build", ...process.argv.slice(2)], { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
