import { ATTACHMENT_CONTENT_TYPES, isAllowedAttachmentSize } from "@/lib/attachment-policy";

export function fileTypeLabel(contentType: string) {
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "text/markdown") return "markdown";
  if (contentType === "text/plain") return "text";
  const category = contentType.split("/")[0];
  return ["image", "audio", "video"].includes(category) ? category : "file";
}

export function uploadError(file: Pick<File, "size" | "type">) {
  if (!isAllowedAttachmentSize(file.size)) return "Choose a file between 1 byte and 30 MB.";
  if (!ATTACHMENT_CONTENT_TYPES.includes(file.type)) return "This file type is not supported.";
  return null;
}

export function safeFileUrl(value: string | null) {
  if (!value) return null;
  try {
    if (value.startsWith("/")) {
      const url = new URL(value, "https://ibx.invalid");
      return url.origin === "https://ibx.invalid" ? `${url.pathname}${url.search}${url.hash}` : null;
    }
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
