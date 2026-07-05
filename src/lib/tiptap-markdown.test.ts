import { describe, expect, test } from "bun:test";

import { markdownMathToTiptapBlocks, tiptapJsonToMarkdown } from "./tiptap-markdown";

describe("tiptap math markdown compatibility", () => {
  test("round-trips inline and display math", () => {
    const markdown = "Euler: $e^{i\\pi} + 1 = 0$.\n\n$$\\int_0^1 x^2 \\, dx$$";
    const blocks = markdownMathToTiptapBlocks(markdown);

    expect(blocks?.[0]?.content?.[1]).toEqual({
      type: "inlineMath",
      attrs: { latex: "e^{i\\pi} + 1 = 0" },
    });
    expect(blocks?.[1]).toEqual({
      type: "blockMath",
      attrs: { latex: "\\int_0^1 x^2 \\, dx" },
    });
    expect(tiptapJsonToMarkdown({ type: "doc", content: blocks }, null)).toBe(markdown);
  });
});
