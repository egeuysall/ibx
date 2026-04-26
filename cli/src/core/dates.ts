import { APP_TIMEZONE } from "./constants.js";
import type { TodoItem, ViewMode } from "./types.js";

const DATE_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const TIME_BLOCK_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIMEZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
export function formatDate(value: number | null) {
  if (value === null) {
    return "no date";
  }

  return getDateKeyInTimezone(value);
}

export function getDateKeyInTimezone(timestamp: number, timeZone = APP_TIMEZONE) {
  const formatter =
    timeZone === APP_TIMEZONE
      ? DATE_KEY_FORMATTER
      : new Intl.DateTimeFormat("en-CA", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
  const parts = formatter.formatToParts(new Date(timestamp));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

export function getTodayDateKey() {
  return getDateKeyInTimezone(Date.now());
}

export function formatTimeBlock(value: number | null) {
  if (value === null) {
    return "unscheduled";
  }

  return TIME_BLOCK_FORMATTER.format(new Date(value));
}

export function formatHoursHuman(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "unsized";
  }

  const totalMinutes = Math.round(value * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

export function sortTodos(items: TodoItem[]) {
  return [...items].sort((left, right) => {
    const leftDate = left.dueDate ?? Number.MAX_SAFE_INTEGER;
    const rightDate = right.dueDate ?? Number.MAX_SAFE_INTEGER;

    if (leftDate !== rightDate) {
      return leftDate - rightDate;
    }

    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    const leftStart = left.timeBlockStart ?? Number.MAX_SAFE_INTEGER;
    const rightStart = right.timeBlockStart ?? Number.MAX_SAFE_INTEGER;
    if (leftStart !== rightStart) {
      return leftStart - rightStart;
    }

    return left.createdAt - right.createdAt;
  });
}

export function filterTodosByView(items: TodoItem[], view: ViewMode) {
  if (view === "all") {
    return sortTodos(items);
  }

  const todayDateKey = getTodayDateKey();

  if (view === "today") {
    return sortTodos(
      items.filter(
        (todo) =>
          todo.status === "open" &&
          todo.dueDate !== null &&
          getDateKeyInTimezone(todo.dueDate) === todayDateKey,
      ),
    );
  }

  if (view === "upcoming") {
    return sortTodos(
      items.filter(
        (todo) =>
          todo.status === "open" &&
          todo.dueDate !== null &&
          getDateKeyInTimezone(todo.dueDate) >= todayDateKey,
      ),
    );
  }

  return sortTodos(items.filter((todo) => todo.status === "done"));
}
