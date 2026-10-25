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
  url: string;
  publicUrl: string | null;
  storageProvider: "convex" | "r2";
};

export type FilesPage = {
  files: FileRecord[];
  cursor: string | null;
  isDone: boolean;
  username: string | null;
};
