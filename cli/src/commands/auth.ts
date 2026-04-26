import process from "node:process";

import { API_KEY_PREFIX, DEFAULT_BASE_URL, EXIT_CODE } from "../core/constants.js";
import { getStringOption, hasFlag } from "../core/args.js";
import { clearConfig, loadConfig, saveConfig } from "../core/config.js";
import { CliError } from "../core/errors.js";
import { verifyAuth } from "../core/http.js";
import { color, logEvent, print, printInfo, printJson, printOk, printWarn } from "../core/output.js";
import type { CliConfig, ParsedArgs } from "../core/types.js";
import { normalizeBaseUrl } from "../core/url.js";
import { normalizeAuthSubcommand } from "./normalize.js";

export async function runAuthCommand(parsed: ParsedArgs) {
  const subcommand = normalizeAuthSubcommand(parsed.positionals[1] ?? "status");
  const outputJson = hasFlag(parsed, "json");

  if (subcommand === "login") {
    const apiKey =
      getStringOption(parsed, "api-key") ??
      process.env.IBX_API_KEY?.trim() ??
      null;
    const baseUrlInput = getStringOption(parsed, "url") ?? DEFAULT_BASE_URL;

    if (!apiKey || !apiKey.startsWith(API_KEY_PREFIX)) {
      throw new CliError(
        "Provide a valid API key with --api-key (must start with iak_).\nexample: ibx auth login --api-key iak_... ",
        { exitCode: EXIT_CODE.VALIDATION, code: "API_KEY_INVALID" },
      );
    }

    const baseUrl = normalizeBaseUrl(baseUrlInput);
    logEvent("info", "auth.login.start", { baseUrl });
    const verification = await verifyAuth(baseUrl, apiKey);

    const config: CliConfig = {
      baseUrl,
      apiKey,
      createdAt: new Date().toISOString(),
    };

    await saveConfig(config);

    if (outputJson) {
      printJson({
        ok: true,
        baseUrl,
        authType: verification.authType ?? "apiKey",
        permission: verification.permission ?? "both",
      });
      return;
    }

    printOk(`connected to ${baseUrl}`);
    printInfo(`auth: ${verification.authType ?? "apiKey"}`);
    printInfo(`permission: ${verification.permission ?? "both"}`);
    logEvent("info", "auth.login.done", {
      baseUrl,
      permission: verification.permission ?? "both",
    });
    return;
  }

  if (subcommand === "logout") {
    await clearConfig();
    logEvent("info", "auth.logout", {});

    if (outputJson) {
      printJson({ ok: true });
      return;
    }

    printOk("signed out locally");
    return;
  }

  if (subcommand === "status") {
    const config = await loadConfig();
    if (!config) {
      if (outputJson) {
        printJson({ authenticated: false });
        return;
      }

      printWarn("not authenticated");
      print(color.gray("run: ibx auth login --api-key iak_..."));
      logEvent("warn", "auth.status", { authenticated: false });
      return;
    }

    try {
      const verification = await verifyAuth(config.baseUrl, config.apiKey);
      if (outputJson) {
        printJson({
          authenticated: true,
          authType: verification.authType ?? "apiKey",
          permission: verification.permission ?? "both",
          baseUrl: config.baseUrl,
          keyHint: `${API_KEY_PREFIX}...${config.apiKey.slice(-4)}`,
        });
        return;
      }

      printOk(`authenticated (${verification.authType ?? "apiKey"})`);
      print(`${color.gray("server:")} ${config.baseUrl}`);
      print(`${color.gray("permission:")} ${verification.permission ?? "both"}`);
      print(
        `${color.gray("key:")} ${API_KEY_PREFIX}...${config.apiKey.slice(-4)}`,
      );
      logEvent("info", "auth.status", {
        authenticated: true,
        permission: verification.permission ?? "both",
      });
      return;
    } catch (error) {
      if (outputJson) {
        printJson({
          authenticated: false,
          error: error instanceof Error ? error.message : "auth failed",
        });
        return;
      }

      printWarn("saved credentials are invalid");
      logEvent("error", "auth.status", { authenticated: false });
      throw error;
    }
  }

  throw new CliError(`Unknown auth subcommand: ${subcommand}`, {
    exitCode: EXIT_CODE.VALIDATION,
    code: "AUTH_SUBCOMMAND_INVALID",
  });
}
