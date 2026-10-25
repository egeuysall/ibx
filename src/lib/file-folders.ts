export type FileFolderPathItem = {
  id: string;
  name: string;
  slug?: string;
  parentFolderId?: string | null;
};

export function folderSlug(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "folder";
}

export function buildFolderPaths(folders: FileFolderPathItem[]) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const paths = new Map<string, string[]>();

  for (const folder of folders) {
    const path: string[] = [];
    const seen = new Set<string>();
    let current: FileFolderPathItem | undefined = folder;
    let valid = true;
    while (current && path.length < 20) {
      if (seen.has(current.id)) {
        valid = false;
        break;
      }
      seen.add(current.id);
      path.push(current.slug || folderSlug(current.name));
      if (current.parentFolderId && !byId.has(current.parentFolderId)) {
        valid = false;
        break;
      }
      current = current.parentFolderId ? byId.get(current.parentFolderId) : undefined;
    }
    if (current) valid = false;
    paths.set(folder.id, valid ? path.reverse() : []);
  }

  return paths;
}
