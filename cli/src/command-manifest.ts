import { runAddCommand } from "./commands/add.js";
import { runAttachCommand } from "./commands/attach.js";
import { runAuthCommand } from "./commands/auth.js";
import { runCalendarCommand } from "./commands/calendar.js";
import { runFilesCommand } from "./commands/files.js";
import { runPageCommand } from "./commands/page.js";
import { runPublishCommand } from "./commands/publish.js";
import { runSelfUpdateCommand } from "./commands/self-update.js";
import { runSyncCommand } from "./commands/sync.js";
import { runTodosCommand } from "./commands/todos.js";
import type { ParsedArgs } from "./core/types.js";

export const CLI_COMMANDS = {
  auth: {
    description: "Sign in, inspect the current account, or sign out.",
    examples: [
      "ibx login",
      "ibx login --api-key iak_...",
      "ibx auth status",
      "ibx whoami",
      "ibx auth logout",
    ],
    run: runAuthCommand,
  },
  add: {
    description: "Turn a thought into a scheduled plan.",
    examples: [
      'ibx add "plan the launch"',
      'ibx n --input "follow up"',
      "ibx",
    ],
    run: runAddCommand,
  },
  todos: {
    description: "List and manage tasks.",
    examples: [
      "ibx list",
      "ibx todos list --view today",
      "ibx todos today-done",
      'ibx todos add "email pat"',
      "ibx todos done --id <id>",
      "ibx todos open --id <id>",
      "ibx todos delete --id <id>",
      "ibx todos set --id <id> --start 14:00",
    ],
    run: runTodosCommand,
  },
  calendar: {
    description: "Inspect or rotate the private calendar feed.",
    examples: ["ibx calendar status", "ibx calendar rotate"],
    run: runCalendarCommand,
  },
  sync: {
    description: "Pull the latest account changes.",
    examples: ["ibx sync --json"],
    run: runSyncCommand,
  },
  page: {
    description: "Create a rich task page.",
    examples: ['ibx page create "launch notes"'],
    run: runPageCommand,
  },
  publish: {
    description: "Publish or unpublish a task page to bri.",
    examples: ["ibx publish <todo-id>", "ibx publish unpublish <todo-id>"],
    run: runPublishCommand,
  },
  attach: {
    description: "Add and manage file attachments.",
    examples: [
      "ibx attach <todo-id> <file>",
      "ibx attach <file> --directory /projects",
      "ibx attach list <todo-id>",
      "ibx attach list --all",
    ],
    run: runAttachCommand,
  },
  files: {
    description: "Browse and organize the files library.",
    examples: [
      "ibx files tree",
      "ibx files list --directory /projects",
      "ibx files upload <file>",
      "ibx files mkdir /projects",
      'ibx files rename <id> "new name"',
      "ibx files move <file-id> <folder-id>",
      "ibx files public <file-id>",
      "ibx files delete <file-id>",
    ],
    run: runFilesCommand,
  },
  "self-update": {
    description: "Update the installed cli.",
    examples: ["ibx self-update"],
    run: async () => runSelfUpdateCommand(),
  },
} satisfies Record<
  string,
  {
    description: string;
    examples: string[];
    run: (args: ParsedArgs) => Promise<void>;
  }
>;

export type CliCommandName = keyof typeof CLI_COMMANDS;
