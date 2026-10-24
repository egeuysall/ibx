export function buildAttachmentUrl(
  origin: string,
  username: string | null,
  attachmentId: string,
  fileName: string,
) {
  if (!username) {
    return `${origin}/api/attachments/${encodeURIComponent(attachmentId)}/file`;
  }

  return `${origin}/${encodeURIComponent(username)}/${encodeURIComponent(fileName)}`;
}
