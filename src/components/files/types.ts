export type FileRecord = {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  visibility: "public" | "private";
  createdAt: number;
  updatedAt: number;
  parentKind: "todo" | "thought" | "file";
  parentId: string;
  folderId?: string | null;
  url: string;
  publicUrl: string | null;
  storageProvider: "convex" | "r2";
};

export type FolderRecord = {
  id: string;
  name: string;
  slug: string;
  parentFolderId: string | null;
  path: string[];
};

export type FilesPage = {
  files: FileRecord[];
  folders: FolderRecord[];
  cursor: string | null;
  isDone: boolean;
  username: string | null;
};
