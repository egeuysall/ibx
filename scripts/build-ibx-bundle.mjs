import { chmodSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = `${__dirname}/..`;

await build({
  entryPoints: [`${rootDir}/cli/src/index.ts`],
  bundle: true,
  platform: "node",
  format: "esm",
  target: ["node20"],
  sourcemap: false,
  minify: true,
  outfile: `${rootDir}/public/ibx`,
});

chmodSync(`${rootDir}/public/ibx`, 0o755);
process.stdout.write("built public/ibx\n");
