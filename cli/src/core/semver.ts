export function parseSemver(version: string) {
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) {
    return null;
  }

  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);
  const patch = Number.parseInt(match[3], 10);
  if (
    !Number.isInteger(major) ||
    !Number.isInteger(minor) ||
    !Number.isInteger(patch)
  ) {
    return null;
  }

  return { major, minor, patch };
}

export function isVersionNewer(latest: string, current: string) {
  const latestParsed = parseSemver(latest);
  const currentParsed = parseSemver(current);
  if (!latestParsed || !currentParsed) {
    return false;
  }

  if (latestParsed.major !== currentParsed.major) {
    return latestParsed.major > currentParsed.major;
  }

  if (latestParsed.minor !== currentParsed.minor) {
    return latestParsed.minor > currentParsed.minor;
  }

  return latestParsed.patch > currentParsed.patch;
}
