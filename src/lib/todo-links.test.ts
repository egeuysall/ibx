import { describe, expect, it } from "bun:test";

import {
  getTodoLinksInputValue,
  getTodoResourceLinks,
  normalizeNoteUrl,
  parseTodoLinksInput,
  stripTodoLinksFromNotes,
} from "./todo-links";

describe("todo links", () => {
  it("preserves URL hash fragments for deep links", () => {
    const url = "https://mail.google.com/mail/u/0/#inbox/FMfcgzQbf";

    expect(normalizeNoteUrl(url)).toBe(url);
    expect(getTodoLinksInputValue(`follow up ${url}`)).toBe(url);
  });

  it("does not truncate displayed link labels", () => {
    const url =
      "https://example.com/a/very/long/path/that/should/remain/readable/for/manual-todos#section";

    expect(getTodoResourceLinks(url)).toEqual([
      {
        url,
        label:
          "example.com/a/very/long/path/that/should/remain/readable/for/manual-todos#section",
      },
    ]);
  });

  it("keeps hash fragments when parsing pasted link input", () => {
    const url = "mail.google.com/mail/u/0/#inbox/FMfcgzQbf";

    expect(parseTodoLinksInput(url)).toEqual({
      links: [`https://${url}`],
      invalidCount: 0,
    });
  });

  it("strips links from display descriptions without mutating saved links", () => {
    expect(
      stripTodoLinksFromNotes(
        "read this links: https://mail.google.com/mail/u/0/#inbox/FMfcgzQbf",
      ),
    ).toBe("read this");
  });
});
