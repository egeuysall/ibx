import { describe, expect, it } from "vitest";
import { runPublicFileCommand, type PublicFile } from "./public-files-terminal";

const files: PublicFile[] = [{
  fileName: "image.png",
  folderPath: ["content", "2026", "10", "25"],
  href: "/egeuysall/content/2026/10/25/image.png",
  contentType: "image/png",
  size: 1024,
}];

describe("public files terminal", () => {
  it("shows nested directories in the read-only tree output", () => {
    expect(runPublicFileCommand("tree", "egeuysall", files)).toEqual([
      { text: "$ tree" },
      { text: "drive/" },
      { text: "├── content/2026/10/25/image.png", file: files[0] },
    ]);
  });

  it("only handles safe read-only commands", () => {
    expect(runPublicFileCommand("pwd", "egeuysall", files)[1]).toEqual({ text: "/egeuysall" });
    expect(runPublicFileCommand("clear", "egeuysall", files)).toEqual([]);
    expect(runPublicFileCommand("rm image.png", "egeuysall", files)[1]).toEqual({ text: "unknown command; type help" });
  });

  it("opens a public file by name or directory path and handles ambiguous names", () => {
    expect(runPublicFileCommand("open image.png", "egeuysall", files)[1]).toEqual({ text: "content/2026/10/25/image.png", file: files[0] });
    expect(runPublicFileCommand("open drive/content/2026/10/25/image.png", "egeuysall", files)[1]).toEqual({ text: "content/2026/10/25/image.png", file: files[0] });
    const duplicate = { ...files[0], folderPath: ["other"] };
    expect(runPublicFileCommand("open image.png", "egeuysall", [...files, duplicate])[1]).toEqual({ text: "multiple files match; open one by path:" });
  });
});
