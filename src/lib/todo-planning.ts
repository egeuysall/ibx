import type { GeneratedTodo } from "@/lib/ai";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TODOS_TODAY = 5;

type ExistingTodo = {
  title: string;
  status: "open" | "done";
  dueDate?: number | null;
};

type PlannedTodo = GeneratedTodo & {
  dueDateTimestamp: number;
};

function getStartOfUtcDay(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function parseDueDateToTimestamp(dueDate: string | null) {
  if (!dueDate) {
    return null;
  }

  const parsed = Date.parse(`${dueDate}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTitleKey(title: string) {
  return title
    .toLocaleLowerCase()
    .replace(/['"`’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isDueTodayUtc(timestamp: number | null | undefined, todayStartUtc: number) {
  if (typeof timestamp !== "number") {
    return false;
  }

  return timestamp >= todayStartUtc && timestamp < todayStartUtc + DAY_MS;
}

export function planGeneratedTodos(
  generatedTodos: GeneratedTodo[],
  existingTodos: ExistingTodo[],
  now = Date.now(),
): PlannedTodo[] {
  const todayStartUtc = getStartOfUtcDay(now);

  const existingOpenTitleKeys = new Set(
    existingTodos
      .filter((todo) => todo.status === "open")
      .map((todo) => normalizeTitleKey(todo.title))
      .filter(Boolean),
  );

  const existingOpenTodayCount = existingTodos.filter(
    (todo) => todo.status === "open" && isDueTodayUtc(todo.dueDate, todayStartUtc),
  ).length;

  const seenGeneratedTitleKeys = new Set<string>();
  const unique = generatedTodos
    .map((todo, index) => ({ todo, index }))
    .filter(({ todo }) => {
      const key = normalizeTitleKey(todo.title);
      if (!key) {
        return false;
      }

      if (existingOpenTitleKeys.has(key) || seenGeneratedTitleKeys.has(key)) {
        return false;
      }

      seenGeneratedTitleKeys.add(key);
      return true;
    });

  const ordered = unique
    .sort((left, right) => {
      if (left.todo.priority !== right.todo.priority) {
        return left.todo.priority - right.todo.priority;
      }

      return left.index - right.index;
    })
    .map(({ todo }) => todo);

  const capped = ordered.slice(0, MAX_TODOS_TODAY);

  let todaySlotsRemaining = Math.max(0, MAX_TODOS_TODAY - existingOpenTodayCount);
  let upcomingOffsetDays = 1;

  return capped.map((todo) => {
    const parsedDueDate = parseDueDateToTimestamp(todo.dueDate);
    const dueDateNeedsPlanning =
      parsedDueDate === null || parsedDueDate <= todayStartUtc;

    if (!dueDateNeedsPlanning) {
      return {
        ...todo,
        dueDateTimestamp: parsedDueDate,
      };
    }

    if (todaySlotsRemaining > 0) {
      todaySlotsRemaining -= 1;
      return {
        ...todo,
        dueDateTimestamp: todayStartUtc,
      };
    }

    const dueDateTimestamp = todayStartUtc + upcomingOffsetDays * DAY_MS;
    upcomingOffsetDays += 1;

    return {
      ...todo,
      dueDateTimestamp,
    };
  });
}
