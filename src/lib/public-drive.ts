export function browsePublicFiles<T extends { fileName: string; folderPath: string[] }>(files: T[], requestedPath: string[]) {
  const folderPaths = new Set<string>();
  for (const file of files) {
    for (let depth = 1; depth <= file.folderPath.length; depth++) {
      folderPaths.add(file.folderPath.slice(0, depth).join("/"));
    }
  }

  const path = folderPaths.has(requestedPath.join("/")) ? requestedPath : [];
  const folders = [...new Set(files.flatMap((file) =>
    file.folderPath.slice(0, path.length).every((part, index) => part === path[index]) && file.folderPath.length > path.length
      ? [file.folderPath[path.length]]
      : []
  ))].sort((a, b) => a.localeCompare(b));
  const visibleFiles = files.filter((file) =>
    file.folderPath.length === path.length && file.folderPath.every((part, index) => part === path[index])
  ).sort((a, b) => a.fileName.localeCompare(b.fileName));

  return { path, folders, files: visibleFiles };
}
