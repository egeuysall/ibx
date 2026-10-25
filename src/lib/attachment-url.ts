export function buildAttachmentUrl(
  origin: string,
  username: string | null,
  attachmentId: string,
  fileName: string,
  folderPath: string[] = [],
) {
  if (!username) {
    return `${origin}/api/attachments/${encodeURIComponent(attachmentId)}/file`;
  }

  const path = [...folderPath, fileName].map(encodeURIComponent).join("/");
  return `${origin}/${encodeURIComponent(username)}/${path}`;
}
