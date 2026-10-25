import { describe, expect, it } from "bun:test";
import { parseFileMention, toPublicLibraryFiles } from "./file-mention";

describe("file mentions", () => {
  it("matches an @ query at the start of a token", () => {
    expect(parseFileMention("note text @song")).toEqual({ query: "song", markerOffset: 10 });
    expect(parseFileMention("@")).toEqual({ query: "", markerOffset: 0 });
  });

  it("stops suggestions after a space and avoids email addresses", () => {
    expect(parseFileMention("@song for")).toBeNull();
    expect(parseFileMention("mail me@example.com")).toBeNull();
  });

  it("only exposes public links from the current IBX origin", () => {
    expect(toPublicLibraryFiles([
      { fileName: "private.png", contentType: "image/png", visibility: "private", publicUrl: null },
      { fileName: "shared.png", contentType: "image/png", visibility: "public", publicUrl: "/egeuysall/songs/shared.png", folderId: "folder-1" },
      { fileName: "external.png", contentType: "image/png", visibility: "public", publicUrl: "https://evil.example/image.png" },
    ], [{ id: "folder-1", path: ["songs"] }], "https://ibx.egeuysal.com")).toEqual([
      { fileName: "shared.png", contentType: "image/png", publicUrl: "https://ibx.egeuysal.com/egeuysall/songs/shared.png", folderPath: ["songs"] },
    ]);
  });
});
