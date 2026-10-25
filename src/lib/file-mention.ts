export function parseFileMention(textBeforeCursor: string) {
  const match = /(?:^|\s)@([^\s@]*)$/.exec(textBeforeCursor);
  if (!match) return null;
  return { query: match[1] ?? "", markerOffset: match.index + match[0].lastIndexOf("@") };
}

export function toPublicLibraryFiles(
  files: Array<{ fileName: string; contentType: string; visibility: string; publicUrl: string | null; folderId?: string }>,
  folders: Array<{ id: string; path: string[] }>,
  origin: string,
) {
  const paths = new Map(folders.map((folder) => [folder.id, folder.path]));
  return files.flatMap((file) => {
    if (file.visibility !== "public" || !file.publicUrl) return [];
    try {
      const url = new URL(file.publicUrl, origin);
      if (url.origin !== origin) return [];
      return [{ fileName: file.fileName, contentType: file.contentType, publicUrl: url.href, folderPath: file.folderId ? paths.get(file.folderId) ?? [] : [] }];
    } catch {
      return [];
    }
  });
}
