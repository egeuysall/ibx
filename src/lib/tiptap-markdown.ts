import type { JSONContent } from "@tiptap/core";

function escapeMarkdownText(value: string) {
  return value.replace(/[\\*_`[\]]/g, "\\$&");
}

function getTextContent(node: JSONContent): string {
  if (typeof node.text === "string") {
    return node.text;
  }

  return (node.content ?? []).map(getTextContent).join("");
}

function mathLatex(node: JSONContent) {
  return typeof node.attrs?.latex === "string" ? node.attrs.latex : "";
}

function inlineMathNodes(text: string): JSONContent[] {
  const nodes: JSONContent[] = [];
  const pattern = /\$([^$\n]+)\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    nodes.push({ type: "inlineMath", attrs: { latex: match[1] ?? "" } });
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push({ type: "text", text: text.slice(lastIndex) });
  }
  return nodes;
}

export function markdownMathToTiptapBlocks(markdown: string): JSONContent[] | null {
  if (!/\$[^$\n]+\$|\$\$/.test(markdown)) {
    return null;
  }

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: JSONContent[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.trim()) continue;

    if (line.trim().startsWith("$$")) {
      const mathLines = [line.trim().slice(2)];
      let nextIndex = index;
      while (!mathLines.at(-1)?.endsWith("$$") && nextIndex + 1 < lines.length) {
        nextIndex += 1;
        mathLines.push(lines[nextIndex] ?? "");
      }
      if (mathLines.at(-1)?.endsWith("$$")) {
        mathLines[mathLines.length - 1] = mathLines.at(-1)?.slice(0, -2) ?? "";
        blocks.push({
          type: "blockMath",
          attrs: { latex: mathLines.join("\n").trim() },
        });
        index = nextIndex;
        continue;
      }
    }

    blocks.push({ type: "paragraph", content: inlineMathNodes(line.trim()) });
  }
  return blocks;
}

function renderInline(node: JSONContent): string {
  let text = typeof node.text === "string" ? escapeMarkdownText(node.text) : "";
  const marks = node.marks ?? [];

  for (const mark of marks) {
    if (mark.type === "bold") {
      text = `**${text}**`;
    } else if (mark.type === "italic") {
      text = `*${text}*`;
    } else if (mark.type === "strike") {
      text = `~~${text}~~`;
    } else if (mark.type === "code") {
      text = `\`${text.replace(/`/g, "\\`")}\``;
    } else if (mark.type === "link") {
      const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
      if (href && /^https?:\/\//i.test(href)) {
        text = `[${text}](${href})`;
      }
    }
  }

  return text;
}

function renderChildren(nodes: JSONContent[] | undefined): string {
  return (nodes ?? [])
    .map((node) =>
      node.type === "inlineMath"
        ? `$${mathLatex(node)}$`
        : typeof node.text === "string"
        ? renderInline(node)
        : renderBlock(node, 0).trim(),
    )
    .join("");
}

function renderListItem(node: JSONContent, depth: number, ordered: boolean, index: number) {
  const indent = "  ".repeat(depth);
  const marker = ordered ? `${index + 1}.` : "-";
  const parts = node.content ?? [];
  const firstParagraph = parts[0]?.type === "paragraph" ? renderChildren(parts[0].content) : "";
  const nested = parts
    .slice(firstParagraph ? 1 : 0)
    .map((child) => renderBlock(child, depth + 1))
    .filter(Boolean)
    .join("\n");

  return `${indent}${marker} ${firstParagraph}${nested ? `\n${nested}` : ""}`;
}

function renderTaskItem(node: JSONContent, depth: number) {
  const checked = node.attrs?.checked === true ? "x" : " ";
  const indent = "  ".repeat(depth);
  const text = renderChildren(node.content?.[0]?.content);
  const nested = (node.content ?? [])
    .slice(1)
    .map((child) => renderBlock(child, depth + 1))
    .filter(Boolean)
    .join("\n");

  return `${indent}- [${checked}] ${text}${nested ? `\n${nested}` : ""}`;
}

function renderTableCell(node: JSONContent | undefined) {
  const text = renderChildren(node?.content?.[0]?.content);
  return text.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function renderTable(node: JSONContent) {
  const rows = (node.content ?? []).filter((row) => row.type === "tableRow");
  const tableRows = rows.map((row) => row.content ?? []);
  const columnCount = Math.max(0, ...tableRows.map((row) => row.length));

  if (rows.length === 0 || columnCount === 0) {
    return "";
  }

  const normalizedRows = tableRows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => renderTableCell(row[index])),
  );
  const header = normalizedRows[0];
  const separator = Array.from({ length: columnCount }, () => "---");
  const body = normalizedRows.slice(1);
  const toLine = (cells: string[]) => `| ${cells.join(" | ")} |`;

  return [toLine(header), toLine(separator), ...body.map(toLine)].join("\n");
}

function renderImage(node: JSONContent) {
  const src = typeof node.attrs?.src === "string" ? node.attrs.src.trim() : "";
  if (!src) {
    return "";
  }

  const alt =
    typeof node.attrs?.alt === "string" && node.attrs.alt.trim()
      ? node.attrs.alt.trim().replace(/[\[\]\n]/g, " ")
      : "image";
  const title =
    typeof node.attrs?.title === "string" && node.attrs.title.trim()
      ? ` "${node.attrs.title.trim().replace(/"/g, '\\"')}"`
      : "";

  return `![${alt}](${src}${title})`;
}

function renderBlock(node: JSONContent, depth: number): string {
  switch (node.type) {
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
      return `${"#".repeat(level)} ${renderChildren(node.content)}`;
    }
    case "paragraph":
      return renderChildren(node.content);
    case "blockMath":
      return `$$${mathLatex(node)}$$`;
    case "blockquote":
      return renderChildren(node.content)
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "codeBlock": {
      const language = typeof node.attrs?.language === "string" ? node.attrs.language : "";
      return `\`\`\`${language}\n${getTextContent(node)}\n\`\`\``;
    }
    case "bulletList":
      return (node.content ?? [])
        .map((child, index) => renderListItem(child, depth, false, index))
        .join("\n");
    case "orderedList":
      return (node.content ?? [])
        .map((child, index) => renderListItem(child, depth, true, index))
        .join("\n");
    case "taskList":
      return (node.content ?? []).map((child) => renderTaskItem(child, depth)).join("\n");
    case "table":
      return renderTable(node);
    case "image":
      return renderImage(node);
    case "horizontalRule":
      return "---";
    default:
      return renderChildren(node.content);
  }
}

export function tiptapJsonToMarkdown(input: unknown, fallbackText: string | null) {
  if (!input || typeof input !== "object") {
    return fallbackText?.trim() ?? "";
  }

  const root = input as JSONContent;
  const markdown = (root.content ?? [])
    .map((node) => renderBlock(node, 0).trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  return markdown || fallbackText?.trim() || "";
}
