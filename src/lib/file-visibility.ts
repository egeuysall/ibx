export type FileVisibility = "public" | "private";

export function resolveFileVisibility(visibility?: FileVisibility): FileVisibility {
  // Existing shared URLs predate visibility; only new writes default private.
  return visibility ?? "public";
}

export function isPublicFile(file: {
  visibility?: FileVisibility;
  status: string;
  deletedAt?: number | null;
}) {
  return resolveFileVisibility(file.visibility) === "public" &&
    file.status === "uploaded" && typeof file.deletedAt !== "number";
}
