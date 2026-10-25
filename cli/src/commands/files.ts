import { basename } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { getStringOption, hasFlag } from "../core/args.js";
import { inferContentType, uploadAttachmentBytes, validateAttachmentSize, type AttachmentMetadata, type AttachmentUpload } from "../core/attachment-upload.js";
import { requireConfig } from "../core/config.js";
import { EXIT_CODE } from "../core/constants.js";
import { CliError } from "../core/errors.js";
import { requestJson } from "../core/http.js";
import { print, printJson, printOk } from "../core/output.js";
import type { ParsedArgs } from "../core/types.js";

type FileRecord = { id: string; fileName: string; contentType: string; size: number; visibility: "private" | "public"; folderId?: string; publicUrl?: string | null };
type Node = { type: "folder" | "file"; id: string; name: string; path?: string[]; children?: Node[]; file?: FileRecord };

function renderTree(nodes: Node[], prefix = ""): string[] {
  return nodes.flatMap((node, index) => {
    const last = index === nodes.length - 1;
    const line = `${prefix}${last ? "└── " : "├── "}${node.type === "folder" ? `${node.name}/` : node.name}`;
    return node.type === "folder"
      ? [line, ...renderTree(node.children ?? [], `${prefix}${last ? "    " : "│   "}`)]
      : [line];
  });
}

function flattenFiles(nodes: Node[], folderPath: string[] = []): Array<{ file: FileRecord; path: string[] }> {
  return nodes.flatMap((node) => node.type === "folder"
    ? flattenFiles(node.children ?? [], [...folderPath, node.name])
    : node.file ? [{ file: { ...node.file, fileName: node.name }, path: folderPath }] : []);
}

export async function runFilesCommand(parsed: ParsedArgs) {
  const config = await requireConfig();
  const action = parsed.positionals[1] ?? "list";
  const outputJson = hasFlag(parsed, "json");

  if (action === "tree" || action === "list") {
    const result = await requestJson<{ tree: Node[]; truncated: boolean }>(config, "/api/files/tree", { method: "GET" }, { action: "read file tree" });
    if (action === "list") {
      const files = flattenFiles(result.tree);
      if (outputJson) printJson({ files, truncated: result.truncated });
      else for (const { file, path } of files) print(`${path.join("/") || "My Drive"}\t${file.visibility}\t${file.fileName}`);
    } else if (outputJson) printJson(result);
    else {
      print("My Drive/");
      for (const line of renderTree(result.tree)) print(line);
      if (result.truncated) print("… tree truncated after 5,000 files");
    }
    return;
  }

  if (action === "mkdir") {
    const name = parsed.positionals[2] ?? getStringOption(parsed, "name");
    if (!name) throw new CliError("Usage: ibx files mkdir <name> [--parent <folderId>].", { exitCode: EXIT_CODE.VALIDATION, code: "FILES_FOLDER_NAME_REQUIRED" });
    const folder = await requestJson<{ folder: { id: string; name: string; parentFolderId: string | null } }>(config, "/api/files", {
      method: "POST", body: JSON.stringify({ name, parentFolderId: getStringOption(parsed, "parent") ?? null }),
    }, { action: "create folder" });
    if (outputJson) printJson(folder); else printOk(`created ${folder.folder.name}/ (${folder.folder.id})`);
    return;
  }

  if (action === "move" || action === "public" || action === "private" || action === "delete") {
    const id = parsed.positionals[2] ?? getStringOption(parsed, "id");
    if (!id) throw new CliError(`Usage: ibx files ${action} <fileId>${action === "move" ? " <folderId|root>" : ""}.`, { exitCode: EXIT_CODE.VALIDATION, code: "FILES_ID_REQUIRED" });
    const method = action === "delete" ? "DELETE" : "PATCH";
    const body = action === "move"
      ? { folderId: parsed.positionals[3] === "root" ? null : parsed.positionals[3] ?? null }
      : { visibility: action };
    const result = await requestJson<{ ok: boolean; folderId?: string | null }>(config, `/api/files/${encodeURIComponent(id)}`, {
      method, ...(method === "PATCH" ? { body: JSON.stringify(body) } : {}),
    }, { action: `${action} file` });
    if (outputJson) printJson(result); else printOk(action === "delete" ? "file deleted" : `file ${action === "move" ? "moved" : `is ${action}`}`);
    return;
  }

  if (action === "upload") {
    const filePath = parsed.positionals[2] ?? getStringOption(parsed, "file");
    if (!filePath) throw new CliError("Usage: ibx files upload <path> [--folder <folderId>] [--public].", { exitCode: EXIT_CODE.VALIDATION, code: "FILES_UPLOAD_PATH_REQUIRED" });
    const info = await stat(filePath).catch(() => null);
    if (!info?.isFile()) throw new CliError(`File not found: ${filePath}`, { exitCode: EXIT_CODE.NOT_FOUND, code: "FILES_UPLOAD_NOT_FOUND" });
    validateAttachmentSize(info.size);
    const metadata: AttachmentMetadata = { parentKind: "file", parentId: "library", fileName: basename(filePath), contentType: inferContentType(filePath), size: info.size };
    const upload = await requestJson<AttachmentUpload>(config, "/api/attachments/upload-url", { method: "POST", body: JSON.stringify(metadata) }, { action: "create file upload URL" });
    validateAttachmentSize(info.size, upload.limits.maxBytes);
    const completion = await uploadAttachmentBytes(upload, metadata, await readFile(filePath));
    const result = await requestJson<{ id: string; fileName: string }>(config, "/api/attachments", { method: "POST", body: JSON.stringify(completion) }, { action: "save file" });
    const folderId = getStringOption(parsed, "folder");
    if (folderId) {
      await requestJson(config, `/api/files/${encodeURIComponent(result.id)}`, {
        method: "PATCH", body: JSON.stringify({ folderId }),
      }, { action: "move uploaded file" });
    }
    if (hasFlag(parsed, "public")) {
      await requestJson(config, `/api/files/${encodeURIComponent(result.id)}`, {
        method: "PATCH", body: JSON.stringify({ visibility: "public" }),
      }, { action: "share uploaded file" });
    }
    if (outputJson) printJson({ ...result, contentType: metadata.contentType, size: info.size });
    else printOk(`uploaded ${result.fileName} (${result.id})`);
    return;
  }

  throw new CliError("Usage: ibx files [tree|list|mkdir|move|public|private|delete|upload].", { exitCode: EXIT_CODE.VALIDATION, code: "FILES_COMMAND_INVALID" });
}
