import { APP_TIMEZONE, EXIT_CODE } from "../core/constants.js";
import { getTodayDateKey } from "../core/dates.js";
import { CliError } from "../core/errors.js";
import type { ParsedArgs, TodoPriority, TodoRecurrence, ViewMode } from "../core/types.js";

export function parsePriority(value: string | null): TodoPriority | null {
  if (value === "1" || value === "2" || value === "3") {
    return Number(value) as TodoPriority;
  }

  return null;
}

export function parseRecurrence(value: string | null): TodoRecurrence | null {
  if (
    value === "none" ||
    value === "daily" ||
    value === "weekly" ||
    value === "monthly"
  ) {
    return value;
  }

  return null;
}

export function parseView(value: string | null): ViewMode {
  if (
    value === "today" ||
    value === "upcoming" ||
    value === "archive" ||
    value === "all"
  ) {
    return value;
  }

  return "today";
}

function parseBooleanString(value: string | null) {
  if (value === null) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return null;
}

export function resolveBooleanOption(
  parsed: ParsedArgs,
  name: string,
  defaultValue: boolean,
) {
  const positive = parsed.options[name];
  const negative = parsed.options[`no-${name}`];

  if (negative === true) {
    return false;
  }

  if (typeof positive === "string") {
    const parsedValue = parseBooleanString(positive);
    if (parsedValue === null) {
      throw new CliError(
        `--${name} must be a boolean (true/false).`,
        { exitCode: EXIT_CODE.VALIDATION, code: "INVALID_BOOLEAN_FLAG" },
      );
    }
    return parsedValue;
  }

  if (positive === true) {
    return true;
  }

  return defaultValue;
}

export function parseEstimatedHours(value: string | null) {
  if (value === null) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (["null", "none", "clear"].includes(normalized)) {
    return null;
  }

  const direct = Number.parseFloat(normalized);
  if (Number.isFinite(direct)) {
    if (direct < 0.25 || direct > 24) {
      return null;
    }

    return Math.round(direct * 4) / 4;
  }

  const regex = /(?:(\d+(?:\.\d+)?)\s*h(?:ours?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:utes?)?)?)?/;
  const match = normalized.match(regex);
  if (!match) {
    return null;
  }

  const hoursPart = match[1] ? Number.parseFloat(match[1]) : 0;
  const minutesPart = match[2] ? Number.parseFloat(match[2]) : 0;
  const total = hoursPart + minutesPart / 60;
  if (!Number.isFinite(total) || total < 0.25 || total > 24) {
    return null;
  }

  return Math.round(total * 4) / 4;
}

function getTimezoneOffsetMs(timestamp: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(timestamp));
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const second = Number(parts.find((part) => part.type === "second")?.value);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - timestamp;
}

function zonedDateTimeToUtcTimestamp(
  dateKey: string,
  hours: number,
  minutes: number,
  timeZone: string,
) {
  const [yearText, monthText, dayText] = dateKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const guess = Date.UTC(year, month - 1, day, hours, minutes, 0);
  const offset = getTimezoneOffsetMs(guess, timeZone);
  let resolved = Date.UTC(year, month - 1, day, hours, minutes, 0) - offset;
  const adjustedOffset = getTimezoneOffsetMs(resolved, timeZone);
  if (adjustedOffset !== offset) {
    resolved = Date.UTC(year, month - 1, day, hours, minutes, 0) - adjustedOffset;
  }

  return Number.isFinite(resolved) ? resolved : null;
}

export function parseTimeBlockStart(
  value: string | null,
  dueDate: string | null,
) {
  if (value === null) {
    return { provided: false, timeBlockStart: undefined as number | null | undefined };
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return { provided: false, timeBlockStart: undefined as number | null | undefined };
  }

  if (["none", "null", "clear", "unscheduled"].includes(normalized)) {
    return { provided: true, timeBlockStart: null };
  }

  const datePrefix = dueDate ?? getTodayDateKey();
  const timeMatch = normalized.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
  if (!timeMatch) {
    throw new CliError(
      "--start must be HH:mm, HH:mm am/pm, or 'clear'.",
      { exitCode: EXIT_CODE.VALIDATION, code: "INVALID_START_TIME" },
    );
  }

  let hours = Number.parseInt(timeMatch[1], 10);
  const minutes = Number.parseInt(timeMatch[2], 10);
  const meridiem = timeMatch[3]?.toLowerCase() ?? null;

  if (minutes < 0 || minutes > 59) {
    throw new CliError("--start minute must be between 00 and 59.", {
      exitCode: EXIT_CODE.VALIDATION,
      code: "INVALID_START_MINUTE",
    });
  }

  if (meridiem) {
    if (hours < 1 || hours > 12) {
      throw new CliError("--start hour must be 1-12 when using am/pm.", {
        exitCode: EXIT_CODE.VALIDATION,
        code: "INVALID_START_HOUR_12H",
      });
    }

    if (hours === 12) {
      hours = 0;
    }

    if (meridiem === "pm") {
      hours += 12;
    }
  } else if (hours < 0 || hours > 23) {
    throw new CliError("--start hour must be between 00 and 23.", {
      exitCode: EXIT_CODE.VALIDATION,
      code: "INVALID_START_HOUR_24H",
    });
  }

  const parsed = zonedDateTimeToUtcTimestamp(
    datePrefix,
    hours,
    minutes,
    APP_TIMEZONE,
  );
  if (parsed === null) {
    throw new CliError("Unable to parse --start time.", {
      exitCode: EXIT_CODE.VALIDATION,
      code: "INVALID_START_PARSE",
    });
  }

  return { provided: true, timeBlockStart: parsed };
}
