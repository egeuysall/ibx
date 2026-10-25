import { describe, expect, it } from "vitest";
import { buildFileTree } from "./file-tree";

describe("file tree", () => {
  it("nests files and folders and sorts folders before files", () => {
    const tree = buildFileTree(
      [
        { id: "nested", name: "Nested", parentFolderId: "folder" },
        { id: "folder", name: "Projects", parentFolderId: null },
      ],
      [
        { id: "b", fileName: "z.txt", folderId: "folder" },
        { id: "a", fileName: "a.txt" },
      ],
      new Map([["folder", ["Projects"]], ["nested", ["Projects", "Nested"]]]),
    );
    expect(tree.map(({ name, type }) => `${type}:${name}`)).toEqual(["folder:Projects", "file:a.txt"]);
    expect(tree[0]?.children?.map(({ name, type }) => `${type}:${name}`)).toEqual(["folder:Nested", "file:z.txt"]);
  });
});
