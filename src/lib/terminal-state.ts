export type TerminalState = {
  open: boolean;
  input: string;
  output: string[];
  history: string[];
  listedIds: string[] | null;
  search: string;
};

// Bound browser storage; it is user-controlled and can contain old versions.
export function parseTerminalState(raw: string | null): TerminalState | null {
  try {
    if (!raw || raw.length > 500_000) return null;
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const strings = (
      items: unknown,
      limit: number,
      length: number,
    ): string[] =>
      Array.isArray(items)
        ? items
            .filter((item): item is string => typeof item === "string")
            .slice(-limit)
            .map((item) => item.slice(0, length))
        : [];
    return {
      open: value.open === true,
      input: typeof value.input === "string" ? value.input.slice(0, 2_000) : "",
      output: strings(value.output, 42, 500_000).map((entry) => {
        if (entry.length <= 8_000) return entry;
        const end = entry.lastIndexOf("\n", 8_000);
        return `${end < 0 ? "" : entry.slice(0, end)}\n[output truncated]`;
      }),
      history: strings(value.history, 50, 2_000),
      listedIds: Array.isArray(value.listedIds)
        ? strings(value.listedIds, 24, 200)
        : null,
      search:
        typeof value.search === "string" ? value.search.slice(0, 2_000) : "",
    };
  } catch {
    return null;
  }
}

export function resolveTerminalTodo<T extends { id: string }>(
  value: string,
  todos: T[],
  visible: T[],
  listedIds: string[] | null,
): T | null {
  if (/^\d+$/.test(value)) {
    const index = Number(value) - 1;
    const id = listedIds !== null ? listedIds[index] : visible[index]?.id;
    return todos.find((todo) => todo.id === id) ?? null;
  }
  return todos.find((todo) => todo.id === value) ?? null;
}
