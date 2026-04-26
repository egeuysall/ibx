import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = `${__dirname}/..`;
const cliPackagePath = `${rootDir}/cli/package.json`;
const cliPackage = JSON.parse(readFileSync(cliPackagePath, "utf8"));
const cliVersion =
  typeof cliPackage.version === "string" ? cliPackage.version : "0.0.0";

await build({
  entryPoints: [`${rootDir}/cli/src/index.ts`],
  bundle: true,
  platform: "node",
  format: "esm",
  target: ["node20"],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  plugins: [
    {
      name: "stub-react-devtools-core",
      setup(builder) {
        builder.onResolve({ filter: /^react-devtools-core$/ }, () => ({
          path: "react-devtools-core",
          namespace: "react-devtools-core-stub",
        }));
        builder.onLoad(
          { filter: /.*/, namespace: "react-devtools-core-stub" },
          () => ({
            contents:
              "export default { initialize() {}, connectToDevTools() {} };",
            loader: "js",
          }),
        );
      },
    },
  ],
  sourcemap: false,
  minify: true,
  outfile: `${rootDir}/public/ibx`,
});

const bundlePath = `${rootDir}/public/ibx`;
writeFileSync(
  bundlePath,
  readFileSync(bundlePath, "utf8").replace(/[ \t]+$/gm, ""),
  "utf8",
);
chmodSync(bundlePath, 0o755);
writeFileSync(
  `${rootDir}/public/ibx-version.json`,
  `${JSON.stringify(
    {
      name: "@ibx/cli",
      version: cliVersion,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
  "utf8",
);
process.stdout.write("built public/ibx\n");
