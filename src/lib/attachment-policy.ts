export const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024;

export const ATTACHMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/gif", "image/jpeg", "image/png", "image/webp",
  "text/markdown", "text/plain",
  "audio/mpeg", "audio/mp3", "audio/mp4", "audio/wav", "audio/x-wav",
  "audio/ogg", "audio/webm",
  "video/mp4", "video/webm", "video/quicktime", "video/ogg", "video/x-m4v",
];

export function isAllowedAttachmentSize(size: number) {
  return Number.isSafeInteger(size) && size > 0 && size <= MAX_ATTACHMENT_BYTES;
}
