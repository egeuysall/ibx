import process from "node:process";
import { createInterface } from "node:readline/promises";

import { getStringOption } from "./args.js";
import { color } from "./output.js";
import type { ParsedArgs } from "./types.js";

async function readFromStdin() {
  if (process.stdin.isTTY) {
    return null;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text.length ? text : null;
}

async function promptForInput(promptText: string) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const value = (await rl.question(promptText)).trim();
  rl.close();

  return value.length ? value : null;
}

export async function resolveAiInput(parsed: ParsedArgs) {
  const fromOption = getStringOption(parsed, "input");
  if (fromOption) {
    return fromOption;
  }

  const fromPositional = parsed.positionals.slice(2).join(" ").trim();
  if (fromPositional.length > 0) {
    return fromPositional;
  }

  const fromStdin = await readFromStdin();
  if (fromStdin) {
    return fromStdin;
  }

  if (process.stdin.isTTY) {
    return promptForInput(`${color.cyan(">")} what's in your mind? `);
  }

  return null;
}
