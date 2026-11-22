// Production Cloudflare build. Next loads .env.local over .env.production, and OpenNext bakes that env into
// .open-next/cloudflare/next-env.mjs, so a plain build ships the dev Convex deployment and the dev server secret
// (every request then fails with "Unauthorized server access"). This hides .env.local for the build, forces the prod
// Convex URL, and refuses to finish if the bundle still points at dev.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync } from "node:fs";

const local = ".env.local";
const hidden = ".env.local.bak-build";
const prodConvexUrl = "https://strong-fennec-517.convex.cloud";
// Public Clerk values. They live only in .env.local, which this build hides, and an empty publishable key in the client bundle
// means Clerk never starts and <SignIn /> renders nothing.
const prodClerkPublishableKey = "pk_live_Y2xlcmsuaWJ4LmVnZXV5c2FsLmNvbSQ";

let moved = false;
function restore() {
  if (moved && existsSync(hidden)) {
    renameSync(hidden, local);
    moved = false;
  }
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    restore();
    process.exit(1);
  });
}

if (existsSync(local)) {
  renameSync(local, hidden);
  moved = true;
}

let status = 1;
try {
  const result = spawnSync("bunx", ["opennextjs-cloudflare", "build"], {
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_CONVEX_URL: prodConvexUrl,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: prodClerkPublishableKey,
      NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in",
      NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/sign-up",
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? "https://ibx.egeuysal.com",
    },
  });
  status = result.status ?? 1;
} finally {
  restore();
}

if (status !== 0) process.exit(status);

const baked = readFileSync(".open-next/cloudflare/next-env.mjs", "utf8");
if (baked.includes("hallowed-quail") || !baked.includes("strong-fennec-517")) {
  console.error("Build refused: the bundle does not point at the prod Convex deployment (strong-fennec-517).");
  process.exit(1);
}
if (/"IBX_CONVEX_SERVER_SECRET"|"CLERK_SECRET_KEY"/.test(baked)) {
  console.error("Build refused: secrets were baked into the bundle. They must come from Worker secrets only.");
  process.exit(1);
}
const clientChunks = spawnSync("grep", ["-rlF", prodClerkPublishableKey, ".open-next/assets/_next/static"], { encoding: "utf8" });
if (!clientChunks.stdout.trim()) {
  console.error("Build refused: the Clerk publishable key is not in the client bundle.");
  process.exit(1);
}
console.log("Prod build verified: prod Convex only, no secrets baked.");
