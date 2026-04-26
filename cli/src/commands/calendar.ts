import { EXIT_CODE } from "../core/constants.js";
import { hasFlag } from "../core/args.js";
import { requireConfig } from "../core/config.js";
import { CliError } from "../core/errors.js";
import { requestJson } from "../core/http.js";
import { color, logEvent, print, printInfo, printJson, printOk, printWarn } from "../core/output.js";
import type { ParsedArgs } from "../core/types.js";
import { normalizeCalendarSubcommand } from "./normalize.js";

export async function runCalendarCommand(parsed: ParsedArgs) {
  const subcommand = normalizeCalendarSubcommand(parsed.positionals[1] ?? "status");
  const outputJson = hasFlag(parsed, "json");
  const config = await requireConfig();

  if (subcommand === "status") {
    const response = await requestJson<{
      activeFeed: {
        id: string;
        name: string;
        prefix: string;
        last4: string;
        createdAt: number;
      } | null;
    }>(
      config,
      "/api/calendar/feed-token",
      { method: "GET" },
      { action: "get calendar feed status" },
    );

    if (outputJson) {
      printJson(response);
      return;
    }

    if (!response.activeFeed) {
      printWarn("no active calendar feed token");
      printInfo("run: ibx calendar rotate");
      return;
    }

    logEvent("info", "calendar.feed.status", {
      active: true,
      last4: response.activeFeed.last4,
    });
    printOk("calendar feed token active");
    print(`${color.gray("name:")} ${response.activeFeed.name}`);
    print(`${color.gray("key:")} ${response.activeFeed.prefix}...${response.activeFeed.last4}`);
    print(
      `${color.gray("created:")} ${new Date(response.activeFeed.createdAt).toISOString()}`,
    );
    printWarn("feed URL is only shown when rotating to avoid leaking old secrets.");
    return;
  }

  if (subcommand === "rotate") {
    const response = await requestJson<{
      ok: true;
      feedUrl: string;
      feed: {
        id: string;
        name: string;
        prefix: string;
        last4: string;
        createdAt: number;
      };
    }>(
      config,
      "/api/calendar/feed-token",
      { method: "POST", body: JSON.stringify({}) },
      { action: "rotate calendar feed token" },
    );

    if (outputJson) {
      printJson(response);
      return;
    }

    logEvent("info", "calendar.feed.rotate", {
      id: response.feed.id,
      last4: response.feed.last4,
    });
    printOk("calendar feed token rotated");
    print(`${color.gray("new feed url:")} ${response.feedUrl}`);
    printWarn("keep this URL private; anyone with it can read your schedule.");
    return;
  }

  throw new CliError(`Unknown calendar subcommand: ${subcommand}`, {
    exitCode: EXIT_CODE.VALIDATION,
    code: "CALENDAR_SUBCOMMAND_INVALID",
  });
}
