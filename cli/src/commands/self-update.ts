import { chmod, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

import {
  EXIT_CODE,
  GITHUB_REPOSITORY,
  VERSION,
} from "../core/constants.js";
import { CliError } from "../core/errors.js";
import { printInfo, printOk, printWarn } from "../core/output.js";
import { isVersionNewer, parseSemver } from "../core/semver.js";

type GitHubRelease = {
  tag_name?: unknown;
  html_url?: unknown;
  assets?: Array<{
    name?: unknown;
    browser_download_url?: unknown;
  }>;
};

function normalizeReleaseVersion(tagName: unknown) {
  if (typeof tagName !== "string") {
    return null;
  }

  const parsed = parseSemver(tagName);
  return parsed ? `${parsed.major}.${parsed.minor}.${parsed.patch}` : null;
}

function getInstallTarget() {
  const currentExecutable = process.argv[1];
  if (!currentExecutable) {
    throw new CliError("Could not resolve current ibx executable path.", {
      exitCode: EXIT_CODE.VALIDATION,
      code: "SELF_UPDATE_TARGET_UNKNOWN",
    });
  }

  return resolve(currentExecutable);
}

async function fetchLatestRelease() {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/latest`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `ibx/${VERSION}`,
      },
    },
  );

  if (!response.ok) {
    throw new CliError(`GitHub release lookup failed (${response.status}).`, {
      exitCode: EXIT_CODE.NETWORK,
      code: "SELF_UPDATE_RELEASE_LOOKUP_FAILED",
    });
  }

  return (await response.json()) as GitHubRelease;
}

async function downloadAsset(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/octet-stream",
      "User-Agent": `ibx/${VERSION}`,
    },
  });

  if (!response.ok) {
    throw new CliError(`CLI download failed (${response.status}).`, {
      exitCode: EXIT_CODE.NETWORK,
      code: "SELF_UPDATE_DOWNLOAD_FAILED",
    });
  }

  return new Uint8Array(await response.arrayBuffer());
}

export async function runSelfUpdateCommand() {
  const release = await fetchLatestRelease();
  const latestVersion = normalizeReleaseVersion(release.tag_name);
  if (!latestVersion) {
    throw new CliError("Latest GitHub release does not have a semver tag.", {
      exitCode: EXIT_CODE.SERVER,
      code: "SELF_UPDATE_VERSION_INVALID",
    });
  }

  if (!isVersionNewer(latestVersion, VERSION)) {
    printOk(`ibx is up to date (${VERSION})`);
    return;
  }

  const asset = release.assets?.find(
    (candidate) =>
      candidate.name === "ibx" &&
      typeof candidate.browser_download_url === "string",
  );
  if (!asset || typeof asset.browser_download_url !== "string") {
    throw new CliError("Latest GitHub release does not include an ibx asset.", {
      exitCode: EXIT_CODE.NOT_FOUND,
      code: "SELF_UPDATE_ASSET_MISSING",
    });
  }

  const target = getInstallTarget();
  const tmpTarget = `${target}.tmp-${process.pid}`;
  printInfo(`downloading ibx ${latestVersion}`);
  const bytes = await downloadAsset(asset.browser_download_url);
  await writeFile(tmpTarget, bytes, { mode: 0o755 });
  await chmod(tmpTarget, 0o755);

  try {
    await rename(tmpTarget, target);
  } catch (error) {
    throw new CliError(
      `Could not replace ${target}. Try: curl -fsSL https://ibx.egeuysal.com/install.sh | bash`,
      {
        exitCode: EXIT_CODE.VALIDATION,
        code: "SELF_UPDATE_REPLACE_FAILED",
        details: {
          target,
          directory: dirname(target),
          error: error instanceof Error ? error.message : String(error),
        },
      },
    );
  }

  printOk(`updated ibx ${VERSION} -> ${latestVersion}`);
  if (typeof release.html_url === "string") {
    printWarn(release.html_url);
  }
}
