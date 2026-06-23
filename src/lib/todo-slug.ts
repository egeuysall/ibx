import type { TodoItem } from "@/lib/types";

export function slugifyTodoTitle(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  return slug || "todo";
}

export function getTodoPageHref(todo: Pick<TodoItem, "id" | "title">) {
  return `/app/todos/${slugifyTodoTitle(todo.title)}--${todo.id}`;
}

export function getTodoIdFromSlug(todoSlug: string) {
  const trimmed = todoSlug.trim();
  const stableSeparatorIndex = trimmed.lastIndexOf("--");
  if (stableSeparatorIndex >= 0) {
    return trimmed.slice(stableSeparatorIndex + 2);
  }

  const separatorIndex = trimmed.lastIndexOf("-");
  return separatorIndex >= 0 ? trimmed.slice(separatorIndex + 1) : trimmed;
}
