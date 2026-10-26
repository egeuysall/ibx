import { describe, expect, it } from "vitest";
import { browsePublicFiles } from "./public-drive";

const files = [
  { fileName: "root.txt", folderPath: [] },
  { fileName: "one.jpg", folderPath: ["content", "2026"] },
  { fileName: "two.jpg", folderPath: ["content", "2026"] },
  { fileName: "three.jpg", folderPath: ["photos"] },
];

describe("public drive navigation", () => {
  it("shows root files and only immediate child folders", () => {
    expect(browsePublicFiles(files, [])).toMatchObject({
      path: [],
      folders: ["content", "photos"],
      files: [files[0]],
    });
  });

  it("shows files inside the selected folder and returns to root for an unknown path", () => {
    expect(browsePublicFiles(files, ["content"]).folders).toEqual(["2026"]);
    expect(browsePublicFiles(files, ["content", "2026"]).files).toEqual([files[1], files[2]]);
    expect(browsePublicFiles(files, ["missing"]).path).toEqual([]);
  });
});
