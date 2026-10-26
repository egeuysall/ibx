import { extname } from "node:path";
import { EXIT_CODE } from "./constants.js";
import { CliError } from "./errors.js";

export const MAX_ATTACHMENT_BYTES = 500 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".gif": "image/gif", ".jpeg": "image/jpeg", ".jpg": "image/jpeg",
  ".md": "text/markdown", ".pdf": "application/pdf", ".png": "image/png",
  ".svg": "image/svg+xml", ".txt": "text/plain", ".webp": "image/webp", ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".mp4": "video/mp4", ".m4v": "video/x-m4v", ".mov": "video/quicktime",
  ".webm": "video/webm", ".ogv": "video/ogg",
};

export function inferContentType(path: string) {
  return MIME_BY_EXTENSION[extname(path).toLowerCase()] ?? "application/octet-stream";
}

export type AttachmentMetadata = {
  parentKind: "todo" | "file";
  parentId: string;
  folderId?: string;
  directory?: string;
  visibility?: "public" | "private";
  fileName: string;
  contentType: string;
  size: number;
};

export type AttachmentUpload = {
  uploadUrl: string;
  method?: "PUT";
  headers?: { "Content-Type": string };
  uploadToken?: string;
  limits: { maxBytes: number; allowedContentTypes: string[] };
};

export function validateAttachmentSize(size: number, maxBytes = MAX_ATTACHMENT_BYTES) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !Number.isSafeInteger(size) || size <= 0 || size > Math.min(maxBytes, MAX_ATTACHMENT_BYTES)) {
    throw new CliError(`Attachment must be between 1 byte and ${Math.min(maxBytes, MAX_ATTACHMENT_BYTES)} bytes.`, {
      exitCode: EXIT_CODE.VALIDATION,
      code: "ATTACH_FILE_SIZE_INVALID",
    });
  }
}

export async function uploadAttachmentBytes(upload: AttachmentUpload, metadata: AttachmentMetadata, bytes: Uint8Array) {
  validateAttachmentSize(bytes.byteLength, upload.limits.maxBytes);
  if (bytes.byteLength !== metadata.size) {
    throw new CliError("Attachment size changed while reading; retry the upload.", {
      exitCode: EXIT_CODE.VALIDATION, code: "ATTACH_FILE_CHANGED",
    });
  }
  if (!upload.limits.allowedContentTypes.includes(metadata.contentType)) {
    throw new CliError(`Unsupported attachment type: ${metadata.contentType}`, {
      exitCode: EXIT_CODE.VALIDATION, code: "ATTACH_FILE_TYPE_INVALID",
    });
  }

  const signed = upload.method === "PUT" && typeof upload.uploadToken === "string" && upload.uploadToken.length > 0;
  if ((upload.method !== undefined || upload.uploadToken !== undefined) &&
      (!signed || upload.headers?.["Content-Type"] !== metadata.contentType)) {
    throw new CliError("Invalid signed upload response.", {
      exitCode: EXIT_CODE.SERVER, code: "ATTACH_UPLOAD_INVALID",
    });
  }
  // Storage gets only the content type, never the IBX API key or API headers.
  const response = await fetch(upload.uploadUrl, {
    method: signed ? "PUT" : "POST",
    headers: { "Content-Type": signed ? upload.headers!["Content-Type"] : metadata.contentType },
    body: new Blob([new Uint8Array(bytes)], { type: metadata.contentType }),
  });
  if (!response.ok) {
    throw new CliError(`Attachment upload failed (${response.status}).`, {
      exitCode: EXIT_CODE.SERVER, code: "ATTACH_UPLOAD_FAILED",
    });
  }
  if (signed) return { uploadToken: upload.uploadToken };

  const result = await response.json().catch(() => null) as { storageId?: unknown } | null;
  if (typeof result?.storageId !== "string" || !result.storageId) {
    throw new CliError("Attachment upload returned no storage ID.", {
      exitCode: EXIT_CODE.SERVER, code: "ATTACH_UPLOAD_FAILED",
    });
  }
  return { ...metadata, storageId: result.storageId };
}
