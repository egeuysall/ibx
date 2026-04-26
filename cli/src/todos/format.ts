import { formatDate, formatHoursHuman, formatTimeBlock } from "../core/dates.js";
import { color, print } from "../core/output.js";
import type { TodoItem, TodoPriority, TodoStatus, ViewMode } from "../core/types.js";

function statusBadge(status: TodoStatus) {
  return status === "done" ? color.green("[x]") : color.dim("[ ]");
}

function priorityBadge(priority: TodoPriority) {
  if (priority === 1) {
    return color.red("p1");
  }

  if (priority === 2) {
    return color.yellow("p2");
  }

  return color.blue("p3");
}

export function printTodoList(items: TodoItem[], view: ViewMode) {
  if (items.length === 0) {
    print(color.gray("(empty)"));
    return;
  }

  let currentGroup = "";
  for (const todo of items) {
    const shouldGroup = view === "upcoming" || view === "archive";
    const nextGroup = shouldGroup ? formatDate(todo.dueDate) : "";

    if (shouldGroup && nextGroup !== currentGroup) {
      currentGroup = nextGroup;
      print(`\n${color.bold(nextGroup)}`);
    }

    print(`${statusBadge(todo.status)} ${color.bold(todo.title)}`);
    print(
      `  ${priorityBadge(todo.priority)} ${color.gray("//")} ${color.gray("due:")} ${formatDate(todo.dueDate)} ${color.gray("//")} ${color.gray("hours:")} ${formatHoursHuman(todo.estimatedHours)} ${color.gray("//")} ${color.gray("block:")} ${formatTimeBlock(todo.timeBlockStart)}`,
    );
    print(`  ${color.gray("id:")} ${todo.id}`);

    if (todo.notes) {
      const preview =
        todo.notes.length > 180 ? `${todo.notes.slice(0, 180)}...` : todo.notes;
      print(`  ${color.gray("notes:")} ${preview}`);
    }

    print("");
  }
}
