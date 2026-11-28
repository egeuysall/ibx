import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { filterTodosByView, formatDate } from "./dates.js";
import type { TodoItem } from "./types.js";

// ibx stores a due date as midnight UTC of the calendar day.
const due = (key: string) => Date.parse(`${key}T00:00:00.000Z`);
const todo = (id: string, key: string) =>
  ({ id, status: "open", dueDate: due(key), priority: 1, timeBlockStart: null, createdAt: 0 }) as TodoItem;
const items = [todo("yesterday", "2026-11-26"), todo("today", "2026-11-27"), todo("tomorrow", "2026-11-28")];
const ids = (list: TodoItem[]) => list.map((item) => item.id);

const realNow = Date.now;
afterEach(() => {
  Date.now = realNow;
});

describe("due dates", () => {
  it("shows the stored calendar day, not the day shifted into Chicago", () => {
    assert.equal(formatDate(due("2026-11-27")), "2026-11-27");
    assert.equal(formatDate(null), "no date");
  });

  // 17:58 and 23:30 in Chicago on Nov 27; the second is already Nov 28 in UTC.
  for (const now of ["2026-11-27T23:58:00.000Z", "2026-11-28T05:30:00.000Z"]) {
    it(`today and upcoming views at ${now}`, () => {
      Date.now = () => Date.parse(now);
      assert.deepEqual(ids(filterTodosByView(items, "today")), ["today"]);
      assert.deepEqual(ids(filterTodosByView(items, "upcoming")), ["today", "tomorrow"]);
    });
  }
});
