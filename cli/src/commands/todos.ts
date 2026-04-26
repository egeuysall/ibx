import { EXIT_CODE } from "../core/constants.js";
import { getStringOption, hasFlag } from "../core/args.js";
import { requireConfig } from "../core/config.js";
import { filterTodosByView, getDateKeyInTimezone, getTodayDateKey, sortTodos } from "../core/dates.js";
import { CliError } from "../core/errors.js";
import { requestJson } from "../core/http.js";
import { color, logEvent, print, printJson, printOk } from "../core/output.js";
import type { CliConfig, ParsedArgs, TodoItem, TodoPriority, TodoRecurrence } from "../core/types.js";
import { printTodoList } from "../todos/format.js";
import { parseEstimatedHours, parsePriority, parseRecurrence, parseTimeBlockStart, parseView } from "../todos/parsing.js";
import { runAddCommand } from "./add.js";
import { normalizeTodosSubcommand } from "./normalize.js";

async function resolveTodoId(
  config: Pick<CliConfig, "baseUrl" | "apiKey">,
  idOrPrefix: string,
) {
  const candidate = idOrPrefix.trim();
  if (candidate.length < 4) {
    throw new CliError("Todo id must be full id or at least 4 characters.", {
      exitCode: EXIT_CODE.VALIDATION,
      code: "TODO_ID_TOO_SHORT",
    });
  }

  const today = getTodayDateKey();
  const response = await requestJson<{ todos: TodoItem[] }>(
    config,
    `/api/todos?today=${encodeURIComponent(today)}`,
    {
      method: "GET",
    },
    { action: "fetch todos for id resolution" },
  );

  const exactMatch = response.todos.find((todo) => todo.id === candidate);
  if (exactMatch) {
    return exactMatch.id;
  }

  const prefixMatches = response.todos.filter((todo) =>
    todo.id.startsWith(candidate),
  );
  if (prefixMatches.length === 1) {
    return prefixMatches[0].id;
  }

  if (prefixMatches.length === 0) {
    throw new CliError(`No todo matches "${candidate}".`, {
      exitCode: EXIT_CODE.NOT_FOUND,
      code: "TODO_NOT_FOUND",
    });
  }

  throw new CliError(
    `Ambiguous todo id prefix "${candidate}" (${prefixMatches.length} matches). Use more characters or full id.`,
    { exitCode: EXIT_CODE.CONFLICT, code: "TODO_ID_AMBIGUOUS" },
  );
}

export async function runTodosCommand(parsed: ParsedArgs) {
  const subcommand = normalizeTodosSubcommand(parsed.positionals[1] ?? "list");
  const outputJson = hasFlag(parsed, "json");
  const config = await requireConfig();

  if (subcommand === "list") {
    const view = parseView(getStringOption(parsed, "view"));
    const today = getTodayDateKey();
    const response = await requestJson<{ todos: TodoItem[] }>(
      config,
      `/api/todos?today=${encodeURIComponent(today)}`,
      {
        method: "GET",
      },
      { action: "list todos" },
    );

    const filtered = filterTodosByView(response.todos, view);

    if (outputJson) {
      printJson({ view, todos: filtered });
      return;
    }

    logEvent("info", "todos.list", { view, count: filtered.length });
    print(`${color.bold(view)} ${color.gray(String(filtered.length))}`);
    printTodoList(filtered, view);
    return;
  }

  if (subcommand === "today-done") {
    const todayDateKey = getTodayDateKey();
    const response = await requestJson<{ todos: TodoItem[] }>(
      config,
      `/api/todos?today=${encodeURIComponent(todayDateKey)}`,
      {
        method: "GET",
      },
      { action: "list today done todos" },
    );

    const filtered = sortTodos(
      response.todos.filter(
        (todo) =>
          todo.status === "done" &&
          todo.dueDate !== null &&
          getDateKeyInTimezone(todo.dueDate) === todayDateKey,
      ),
    );

    if (outputJson) {
      printJson({ view: "today-done", todos: filtered });
      return;
    }

    logEvent("info", "todos.today_done", { count: filtered.length });
    print(`${color.bold("today-done")} ${color.gray(String(filtered.length))}`);
    printTodoList(filtered, "archive");
    return;
  }

  if (subcommand === "run") {
    await runAddCommand(parsed);
    return;
  }

  if (subcommand === "done" || subcommand === "open") {
    const todoIdInput =
      getStringOption(parsed, "id") ?? parsed.positionals[2] ?? null;
    if (!todoIdInput) {
      throw new CliError("Provide todo id with --id.", {
        exitCode: EXIT_CODE.VALIDATION,
        code: "TODO_ID_REQUIRED",
      });
    }
    const todoId = await resolveTodoId(config, todoIdInput);

    await requestJson<{ ok: true }>(config, `/api/todos/${todoId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: subcommand === "done" ? "done" : "open" }),
    }, { action: `mark todo ${subcommand}` });

    if (outputJson) {
      printJson({ ok: true, id: todoId, status: subcommand });
      return;
    }

    logEvent("info", "todos.status", { id: todoId, status: subcommand });
    printOk(`${subcommand} ${todoId}`);
    return;
  }

  if (subcommand === "delete" || subcommand === "remove") {
    const todoIdInput =
      getStringOption(parsed, "id") ?? parsed.positionals[2] ?? null;
    if (!todoIdInput) {
      throw new CliError("Provide todo id with --id.", {
        exitCode: EXIT_CODE.VALIDATION,
        code: "TODO_ID_REQUIRED",
      });
    }
    const todoId = await resolveTodoId(config, todoIdInput);

    await requestJson<{ ok: true }>(config, `/api/todos/${todoId}`, {
      method: "DELETE",
    }, { action: "delete todo" });

    if (outputJson) {
      printJson({ ok: true, id: todoId, status: "deleted" });
      return;
    }

    logEvent("info", "todos.delete", { id: todoId });
    printOk(`deleted ${todoId}`);
    return;
  }

  if (subcommand === "set") {
    const todoIdInput =
      getStringOption(parsed, "id") ?? parsed.positionals[2] ?? null;
    if (!todoIdInput) {
      throw new CliError("Provide todo id with --id.", {
        exitCode: EXIT_CODE.VALIDATION,
        code: "TODO_ID_REQUIRED",
      });
    }
    const todoId = await resolveTodoId(config, todoIdInput);

    const due = getStringOption(parsed, "due");
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
      throw new CliError("--due must be in YYYY-MM-DD format.", {
        exitCode: EXIT_CODE.VALIDATION,
        code: "DUE_DATE_INVALID",
      });
    }

    const recurrence = parseRecurrence(getStringOption(parsed, "recurrence"));
    if (getStringOption(parsed, "recurrence") && !recurrence) {
      throw new CliError(
        "--recurrence must be one of: none, daily, weekly, monthly.",
        { exitCode: EXIT_CODE.VALIDATION, code: "RECURRENCE_INVALID" },
      );
    }

    const priority = parsePriority(getStringOption(parsed, "priority"));
    if (getStringOption(parsed, "priority") && !priority) {
      throw new CliError("--priority must be one of: 1, 2, 3.", {
        exitCode: EXIT_CODE.VALIDATION,
        code: "PRIORITY_INVALID",
      });
    }

    const titleInput = getStringOption(parsed, "title");
    const title =
      titleInput !== null ? titleInput.trim().slice(0, 140) : null;
    if (titleInput !== null && !title) {
      throw new CliError("--title cannot be empty.", {
        exitCode: EXIT_CODE.VALIDATION,
        code: "TITLE_INVALID",
      });
    }

    const notesNull = hasFlag(parsed, "notes-null");
    const notesInput = getStringOption(parsed, "notes");
    const notes =
      notesNull
        ? null
        : notesInput !== null
          ? notesInput.trim().slice(0, 640) || null
          : undefined;

    const hoursRaw = getStringOption(parsed, "hours");
    const hours = parseEstimatedHours(hoursRaw);
    if (hoursRaw !== null && hours === null && !["null", "none", "clear"].includes(hoursRaw.trim().toLowerCase())) {
      throw new CliError("--hours must be a number or duration (e.g. 1.5, 90m, 1h 30m, clear).", {
        exitCode: EXIT_CODE.VALIDATION,
        code: "HOURS_INVALID",
      });
    }

    const startRaw = getStringOption(parsed, "start");
    const startParsed = parseTimeBlockStart(startRaw, due);

    const payload: {
      dueDate?: string | null;
      recurrence?: TodoRecurrence;
      priority?: TodoPriority;
      title?: string;
      notes?: string | null;
      estimatedHours?: number | null;
      timeBlockStart?: number | null;
    } = {};

    if (due !== null) {
      payload.dueDate = due;
    }

    if (recurrence !== null) {
      payload.recurrence = recurrence;
    }

    if (priority !== null) {
      payload.priority = priority;
    }

    if (title !== null) {
      payload.title = title;
    }

    if (notes !== undefined) {
      payload.notes = notes;
    }

    if (hoursRaw !== null) {
      payload.estimatedHours = hours;
    }

    if (startParsed.provided) {
      payload.timeBlockStart = startParsed.timeBlockStart ?? null;
    }

    if (Object.keys(payload).length === 0) {
      throw new CliError(
        "Nothing to update. Set at least one of --title, --notes, --due, --start, --hours, --recurrence, --priority.",
        { exitCode: EXIT_CODE.VALIDATION, code: "SET_EMPTY" },
      );
    }

    await requestJson<{ ok: true }>(config, `/api/todos/${todoId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }, { action: "update todo fields" });

    if (outputJson) {
      printJson({ ok: true, id: todoId, ...payload });
      return;
    }

    logEvent("info", "todos.set", { id: todoId, fields: Object.keys(payload) });
    printOk(`updated ${todoId}`);
    return;
  }

  throw new CliError(`Unknown todos subcommand: ${subcommand}`, {
    exitCode: EXIT_CODE.VALIDATION,
    code: "TODOS_SUBCOMMAND_INVALID",
  });
}
