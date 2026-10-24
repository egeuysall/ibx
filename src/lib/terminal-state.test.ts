import { describe, expect, test } from "bun:test";
import { parseTerminalState, resolveTerminalTodo } from "./terminal-state";

describe("terminal state", () => {
  test("rejects malformed storage and bounds restored data", () => {
    expect(parseTerminalState("{")).toBeNull();
    expect(parseTerminalState("null")).toBeNull();
    const state = parseTerminalState(
      JSON.stringify({
        open: true,
        input: "attach 1",
        output: [123, "hello"],
        history: Array(70).fill("ls"),
        listedIds: ["b"],
        search: "gym",
      }),
    );
    expect(state).toEqual({
      open: true,
      input: "attach 1",
      output: ["hello"],
      history: Array(50).fill("ls"),
      listedIds: ["b"],
      search: "gym",
    });
    expect(parseTerminalState('{"open":"true"}')?.open).toBe(false);
  });
  test("numbered commands use the last listing, not the current view", () => {
    const todos = [{ id: "a" }, { id: "b" }];
    expect(resolveTerminalTodo("1", todos, todos, ["b"])?.id).toBe("b");
    expect(resolveTerminalTodo("b", todos, [], [])?.id).toBe("b");
    expect(resolveTerminalTodo("1", todos, todos, ["deleted"])).toBeNull();
    expect(resolveTerminalTodo("0", todos, todos, [])).toBeNull();
    expect(resolveTerminalTodo("1", todos, todos, [])).toBeNull();
    expect(resolveTerminalTodo("1", todos, todos, null)?.id).toBe("a");
  });
  test("bounds long output without cutting a public URL in half", () => {
    const url = `https://ibx.egeuysal.com/user/${"a".repeat(175)}.pdf`;
    const output = Array(50).fill(`file.pdf\n${url}`).join("\n");
    const restored = parseTerminalState(JSON.stringify({ output: [output] }))!;
    expect(restored.output[0]!.length).toBeLessThan(8_030);
    expect(
      restored.output[0]!.split("\n")
        .filter((line) => line.startsWith("https://"))
        .every((line) => line === url),
    ).toBe(true);
    expect(restored.output[0]!.endsWith("[output truncated]")).toBe(true);
  });
});
