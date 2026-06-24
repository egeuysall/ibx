import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CredentialStore =
  | "keychain"
  | "windows-credential-manager"
  | "linux-secret-service"
  | "config-file";

export type StoredCredential = {
  apiKey: string;
  credentialStore: Exclude<CredentialStore, "config-file">;
};

const SERVICE_NAME = "ibx-cli";
const ACCOUNT_NAME = "default";

function isMacOS() {
  return process.platform === "darwin";
}

function isWindows() {
  return process.platform === "win32";
}

function isLinux() {
  return process.platform === "linux";
}

async function runPowerShell(script: string, env?: Record<string, string>) {
  const mergedEnv = env ? { ...process.env, ...env } : process.env;
  const args = ["-NoProfile", "-NonInteractive", "-Command", script];
  try {
    return await execFileAsync("powershell.exe", args, { env: mergedEnv });
  } catch {
    return await execFileAsync("pwsh", args, { env: mergedEnv });
  }
}

async function runWithStdin(
  command: string,
  args: string[],
  input: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
    child.stdin.end(input);
  });
}

async function readMacOSApiKey(): Promise<string | null> {
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

async function writeMacOSApiKey(apiKey: string): Promise<boolean> {
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

async function deleteMacOSApiKey(): Promise<void> {
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

async function readWindowsApiKey(): Promise<string | null> {
  if (!isWindows()) {
    return null;
  }

  try {
    const { stdout } = await runPowerShell(`
$ErrorActionPreference = 'Stop'
$vault = New-Object Windows.Security.Credentials.PasswordVault
$credential = $vault.FindAllByResource('${SERVICE_NAME}') |
  Where-Object { $_.UserName -eq '${ACCOUNT_NAME}' } |
  Select-Object -First 1
if ($null -eq $credential) { exit 1 }
$credential.RetrievePassword()
[Console]::Out.Write($credential.Password)
`);
    const apiKey = stdout.trim();
    return apiKey || null;
  } catch {
    return null;
  }
}

async function writeWindowsApiKey(apiKey: string): Promise<boolean> {
  if (!isWindows()) {
    return false;
  }

  try {
    await runPowerShell(
      `
$ErrorActionPreference = 'Stop'
$secret = $env:IBX_CLI_API_KEY
if ([string]::IsNullOrWhiteSpace($secret)) { exit 1 }
$vault = New-Object Windows.Security.Credentials.PasswordVault
try {
  $vault.FindAllByResource('${SERVICE_NAME}') |
    Where-Object { $_.UserName -eq '${ACCOUNT_NAME}' } |
    ForEach-Object { $vault.Remove($_) }
} catch {}
$credential = New-Object Windows.Security.Credentials.PasswordCredential('${SERVICE_NAME}', '${ACCOUNT_NAME}', $secret)
$vault.Add($credential)
`,
      { IBX_CLI_API_KEY: apiKey },
    );
    return true;
  } catch {
    return false;
  }
}

async function deleteWindowsApiKey(): Promise<void> {
  if (!isWindows()) {
    return;
  }

  await runPowerShell(`
$ErrorActionPreference = 'Stop'
$vault = New-Object Windows.Security.Credentials.PasswordVault
try {
  $vault.FindAllByResource('${SERVICE_NAME}') |
    Where-Object { $_.UserName -eq '${ACCOUNT_NAME}' } |
    ForEach-Object { $vault.Remove($_) }
} catch {}
`).catch(() => undefined);
}

async function readLinuxApiKey(): Promise<string | null> {
  if (!isLinux()) {
    return null;
  }

  try {
    const { stdout } = await execFileAsync("secret-tool", [
      "lookup",
      "service",
      SERVICE_NAME,
      "account",
      ACCOUNT_NAME,
    ]);
    const apiKey = stdout.trim();
    return apiKey || null;
  } catch {
    return null;
  }
}

async function writeLinuxApiKey(apiKey: string): Promise<boolean> {
  if (!isLinux()) {
    return false;
  }

  try {
    await runWithStdin(
      "secret-tool",
      [
        "store",
        "--label=ibx CLI",
        "service",
        SERVICE_NAME,
        "account",
        ACCOUNT_NAME,
      ],
      apiKey,
    );
    return true;
  } catch {
    return false;
  }
}

async function deleteLinuxApiKey(): Promise<void> {
  if (!isLinux()) {
    return;
  }

  await execFileAsync("secret-tool", [
    "clear",
    "service",
    SERVICE_NAME,
    "account",
    ACCOUNT_NAME,
  ]).catch(() => undefined);
}

export async function readStoredCredential(): Promise<StoredCredential | null> {
  const macOSApiKey = await readMacOSApiKey();
  if (macOSApiKey) {
    return { apiKey: macOSApiKey, credentialStore: "keychain" };
  }

  const windowsApiKey = await readWindowsApiKey();
  if (windowsApiKey) {
    return {
      apiKey: windowsApiKey,
      credentialStore: "windows-credential-manager",
    };
  }

  const linuxApiKey = await readLinuxApiKey();
  if (linuxApiKey) {
    return { apiKey: linuxApiKey, credentialStore: "linux-secret-service" };
  }

  return null;
}

export async function readStoredApiKey(): Promise<string | null> {
  return (await readStoredCredential())?.apiKey ?? null;
}

export async function writeStoredApiKey(
  apiKey: string,
): Promise<CredentialStore | null> {
  if (await writeMacOSApiKey(apiKey)) {
    return "keychain";
  }

  if (await writeWindowsApiKey(apiKey)) {
    return "windows-credential-manager";
  }

  if (await writeLinuxApiKey(apiKey)) {
    return "linux-secret-service";
  }

  return null;
}

export async function deleteStoredApiKey(): Promise<void> {
  await Promise.all([
    deleteMacOSApiKey(),
    deleteWindowsApiKey(),
    deleteLinuxApiKey(),
  ]);
}
