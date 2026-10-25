export const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024;
export const MAX_LIBRARY_FILE_BYTES = 500 * 1024 * 1024;

export const ATTACHMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/gif", "image/jpeg", "image/png", "image/svg+xml", "image/webp",
  "text/markdown", "text/plain",
  "audio/mpeg", "audio/mp3", "audio/mp4", "audio/wav", "audio/x-wav",
  "audio/ogg", "audio/webm",
  "video/mp4", "video/webm", "video/quicktime", "video/ogg", "video/x-m4v",
];

export function isAllowedAttachmentSize(size: number, parentKind?: "todo" | "thought" | "file") {
  return Number.isSafeInteger(size) && size > 0 && size <= (parentKind === "file" ? MAX_LIBRARY_FILE_BYTES : MAX_ATTACHMENT_BYTES);
}
