export type FileTreeEntry = { id: string; name: string; parentFolderId: string | null };
export type FileTreeFile = { id: string; fileName: string; folderId?: string };
export type FileTreeNode = {
  type: "folder" | "file";
  id: string;
  name: string;
  path?: string[];
  children?: FileTreeNode[];
  file?: FileTreeFile;
};

export function buildFileTree(folders: FileTreeEntry[], files: FileTreeFile[], paths: Map<string, string[]>) {
  const nodes: FileTreeNode[] = folders.map((folder) => ({
    type: "folder", name: folder.name, id: folder.id,
    path: paths.get(folder.id) ?? [], children: [],
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const root: FileTreeNode[] = [];
  for (const folder of folders) {
    const node = nodeById.get(folder.id)!;
    const parent = folder.parentFolderId ? nodeById.get(folder.parentFolderId) : null;
    (parent?.children ?? root).push(node);
  }
  for (const file of files) {
    const node: FileTreeNode = { type: "file", id: file.id, name: file.fileName, file };
    (file.folderId ? nodeById.get(file.folderId)?.children ?? root : root).push(node);
  }
  const sortNodes = (items: FileTreeNode[]) => {
    items.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1);
    for (const item of items) if (item.children) sortNodes(item.children);
  };
  sortNodes(root);
  return root;
}
