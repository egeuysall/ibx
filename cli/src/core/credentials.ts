import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CredentialStore = "keychain" | "config-file";

const SERVICE_NAME = "ibx-cli";
const ACCOUNT_NAME = "default";

function isMacOS() {
  return process.platform === "darwin";
}

export async function readStoredApiKey(): Promise<string | null> {
  if (!isMacOS()) {
    return null;
  }

  try {
    const { stdout } = await execFileAsync("security", [
      "find-generic-password",
      "-s",
      SERVICE_NAME,
      "-a",
      ACCOUNT_NAME,
      "-w",
    ]);
    const apiKey = stdout.trim();
    return apiKey || null;
  } catch {
    return null;
  }
}

export async function writeStoredApiKey(apiKey: string): Promise<boolean> {
  if (!isMacOS()) {
    return false;
  }

  try {
    await execFileAsync("security", [
      "add-generic-password",
      "-U",
      "-s",
      SERVICE_NAME,
      "-a",
      ACCOUNT_NAME,
      "-w",
      apiKey,
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function deleteStoredApiKey(): Promise<void> {
  if (!isMacOS()) {
    return;
  }

  await execFileAsync("security", [
    "delete-generic-password",
    "-s",
    SERVICE_NAME,
    "-a",
    ACCOUNT_NAME,
  ]).catch(() => undefined);
}
