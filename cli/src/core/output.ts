import process from "node:process";

import { safeJsonStringify } from "flags";

type LogLevel = "info" | "warn" | "error";

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

export const color = {
  dim: (value: string) => (useColor ? `\x1b[2m${value}\x1b[0m` : value),
  gray: (value: string) => (useColor ? `\x1b[90m${value}\x1b[0m` : value),
  red: (value: string) => (useColor ? `\x1b[31m${value}\x1b[0m` : value),
  green: (value: string) => (useColor ? `\x1b[32m${value}\x1b[0m` : value),
  yellow: (value: string) => (useColor ? `\x1b[33m${value}\x1b[0m` : value),
  blue: (value: string) => (useColor ? `\x1b[34m${value}\x1b[0m` : value),
  magenta: (value: string) => (useColor ? `\x1b[35m${value}\x1b[0m` : value),
  cyan: (value: string) => (useColor ? `\x1b[36m${value}\x1b[0m` : value),
  bold: (value: string) => (useColor ? `\x1b[1m${value}\x1b[0m` : value),
};

function stringifyLogValue(value: unknown) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return safeJsonStringify(value);
}

export function logEvent(
  level: LogLevel,
  action: string,
  fields: Record<string, unknown> = {},
) {
  const timestamp = new Date().toISOString();
  const levelLabel =
    level === "info"
      ? color.cyan(level)
      : level === "warn"
        ? color.yellow(level)
        : color.red(level);
  const serializedFields = Object.entries(fields)
    .map(([key, value]) => `${key}=${stringifyLogValue(value)}`)
    .join(" ");
  const line = `${color.gray(timestamp)} ${levelLabel} action=${action}${
    serializedFields ? ` ${serializedFields}` : ""
  }`;
  process.stderr.write(`${line}\n`);
}

export function print(message = "") {
  process.stdout.write(`${message}\n`);
}

export function printError(message: string) {
  process.stderr.write(`${color.red("error")}: ${message}\n`);
}

export function printInfo(message: string) {
  print(`${color.cyan("i")} ${message}`);
}

export function printOk(message: string) {
  print(`${color.green("ok")} ${message}`);
}

export function printWarn(message: string) {
  print(`${color.yellow("warn")} ${message}`);
}

function colorizeJson(json: string) {
  if (!useColor) {
    return json;
  }

  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g,
    (token) => {
      if (token.startsWith('"')) {
        if (token.endsWith(":")) {
          return color.bold(color.cyan(token));
        }

        return color.green(token);
      }

      if (token === "true" || token === "false") {
        return color.yellow(token);
      }

      if (token === "null") {
        return color.gray(token);
      }

      return color.magenta(token);
    },
  );
}

export function printJson(value: unknown) {
  const json = safeJsonStringify(value, null, 2);
  print(colorizeJson(json));
}
