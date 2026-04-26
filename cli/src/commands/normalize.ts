export function normalizeAuthSubcommand(value: string | null) {
  if (!value) {
    return "status";
  }

  if (value === "login" || value === "l" || value === "in") {
    return "login";
  }

  if (value === "logout" || value === "out" || value === "o") {
    return "logout";
  }

  if (value === "status" || value === "s" || value === "st") {
    return "status";
  }

  return value;
}

export function normalizeTodosSubcommand(value: string | null) {
  if (!value) {
    return "list";
  }

  if (value === "list" || value === "ls" || value === "l") {
    return "list";
  }

  if (value === "done" || value === "x") {
    return "done";
  }

  if (value === "open" || value === "o") {
    return "open";
  }

  if (
    value === "delete" ||
    value === "remove" ||
    value === "del" ||
    value === "rm" ||
    value === "d"
  ) {
    return "delete";
  }

  if (value === "set" || value === "s") {
    return "set";
  }

  if (value === "run" || value === "r") {
    return "run";
  }

  if (
    value === "today-done" ||
    value === "completed-today" ||
    value === "td" ||
    value === "ct" ||
    value === "c"
  ) {
    return "today-done";
  }

  return value;
}

export function normalizeCalendarSubcommand(value: string | null) {
  if (!value) {
    return "status";
  }

  if (value === "status" || value === "s" || value === "show") {
    return "status";
  }

  if (
    value === "rotate" ||
    value === "new" ||
    value === "create" ||
    value === "generate" ||
    value === "r"
  ) {
    return "rotate";
  }

  return value;
}
