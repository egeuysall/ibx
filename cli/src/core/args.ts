import type { ParsedArgs } from "./types.js";

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("-")) {
      positionals.push(token);
      continue;
    }

    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (token.startsWith("--")) {
      const [key, rawValue] = token.slice(2).split("=", 2);
      if (!key) {
        continue;
      }

      if (rawValue !== undefined) {
        options[key] = rawValue;
        continue;
      }

      const next = argv[index + 1];
      if (next && !next.startsWith("-")) {
        options[key] = next;
        index += 1;
      } else {
        options[key] = true;
      }
      continue;
    }

    const shortFlags = token.slice(1);
    for (const flag of shortFlags) {
      if (flag === "h") {
        options.help = true;
      }
      if (flag === "v") {
        options.version = true;
      }
      if (flag === "j") {
        options.json = true;
      }
    }
  }

  return { positionals, options };
}

export function getStringOption(parsed: ParsedArgs, name: string): string | null {
  const value = parsed.options[name];
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function hasFlag(parsed: ParsedArgs, name: string) {
  return parsed.options[name] === true;
}
