import { copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const runner = resolve(root, "cli-runner");

execFileSync("node", [resolve(root, "scripts/build-ibx-bundle.mjs")], { cwd: root, stdio: "inherit" });
copyFileSync(resolve(root, "public/ibx"), resolve(runner, "ibx.mjs"));

await build({
  entryPoints: [resolve(root, "src/lib/landing-shell.ts")],
  outfile: resolve(runner, "shell.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: ["node22"],
  plugins: [{
    name: "noop-server-only",
    setup(b) {
      b.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "noop" }));
      b.onLoad({ filter: /.*/, namespace: "noop" }, () => ({ contents: "", loader: "js" }));
    },
  }],
});
console.log("ibx cli-runner build ready");
