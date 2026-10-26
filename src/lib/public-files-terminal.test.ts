import { describe, expect, it } from "vitest";
import { runPublicFileCommand, type PublicFile } from "./public-files-terminal";

const files: PublicFile[] = [
  {
    fileName: "image.png",
    folderPath: ["content", "2026", "10", "25"],
    href: "/egeuysall/content/2026/10/25/image.png",
    contentType: "image/png",
    size: 1024,
  },
  { fileName: "cover.jpg", folderPath: [], href: "/egeuysall/cover.jpg", contentType: "image/jpeg", size: 1024 },
];

describe("public files terminal", () => {
  it("shows nested directories in the read-only tree output", () => {
    expect(runPublicFileCommand("tree", "egeuysall", files).lines).toEqual([
      { text: "$ tree" },
      { text: "drive/" },
      { text: "├── content/" },
      { text: "│   └── 2026/" },
      { text: "│       └── 10/" },
      { text: "│           └── 25/" },
      { text: "│               └── image.png", file: files[0] },
      { text: "└── cover.jpg", file: files[1] },
    ]);
  });

  it("only handles safe read-only commands", () => {
    expect(runPublicFileCommand("pwd", "egeuysall", files).lines[1]).toEqual({ text: "/egeuysall" });
    expect(runPublicFileCommand("clear", "egeuysall", files).lines).toEqual([]);
    expect(runPublicFileCommand("rm image.png", "egeuysall", files).lines[1]).toEqual({ text: "unknown command; type help" });
  });

  it("opens a public file by name or directory path and handles ambiguous names", () => {
    expect(runPublicFileCommand("open image.png", "egeuysall", files).lines[1]).toEqual({ text: "content/2026/10/25/image.png", file: files[0] });
    expect(runPublicFileCommand("open drive/content/2026/10/25/image.png", "egeuysall", files).lines[1]).toEqual({ text: "content/2026/10/25/image.png", file: files[0] });
    const duplicate = { ...files[0], folderPath: ["other"] };
    expect(runPublicFileCommand("open image.png", "egeuysall", [...files, duplicate]).lines[1]).toEqual({ text: "multiple files match; open one by path:" });
  });

  it("changes directories, scopes tree and resolves open relative to the current directory", () => {
    const entered = runPublicFileCommand("cd content/2026/10/25", "egeuysall", files);
    expect(entered.directory).toEqual(["content", "2026", "10", "25"]);
    const tree = runPublicFileCommand("tree", "egeuysall", files, entered.directory).lines;
    expect(tree.map((line) => line.text)).toEqual([
      "$ tree",
      "drive/content/2026/10/25/",
      "└── image.png",
    ]);
    expect(tree[2]?.file?.href).toBe(files[0]?.href);
    expect(runPublicFileCommand("open image.png", "egeuysall", files, entered.directory).lines[1]).toEqual({
      text: "content/2026/10/25/image.png",
      file: files[0],
    });
    expect(runPublicFileCommand("cd ..", "egeuysall", files, entered.directory).directory).toEqual(["content", "2026", "10"]);
    expect(runPublicFileCommand("cd ../../../../..", "egeuysall", files, entered.directory).directory).toEqual([]);
    expect(runPublicFileCommand("cd missing", "egeuysall", files, entered.directory)).toMatchObject({
      directory: entered.directory,
      lines: [{ text: "$ cd missing" }, { text: "directory not found" }],
    });
  });
});
