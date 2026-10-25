import { describe, expect, it } from "vitest";
import { buildFolderPaths, folderSlug } from "./file-folders";

describe("file folder paths", () => {
  it("builds nested URL paths and falls back for legacy folders", () => {
    expect(folderSlug("Songs & Audio")).toBe("songs-audio");
    expect(buildFolderPaths([
      { id: "songs", name: "Songs" },
      { id: "live", name: "Live Sets", parentFolderId: "songs" },
    ])).toEqual(new Map([
      ["songs", ["songs"]],
      ["live", ["songs", "live-sets"]],
    ]));
  });

  it("fails closed for broken and cyclic folder references", () => {
    expect(buildFolderPaths([
      { id: "missing", name: "Missing", parentFolderId: "absent" },
      { id: "a", name: "A", parentFolderId: "b" },
      { id: "b", name: "B", parentFolderId: "a" },
    ])).toEqual(new Map([["missing", []], ["a", []], ["b", []]]));
  });
});
