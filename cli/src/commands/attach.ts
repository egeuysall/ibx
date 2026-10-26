import { basename } from "node:path";
import { readFile, stat } from "node:fs/promises";

import { getStringOption, hasFlag } from "../core/args.js";
import { inferContentType, uploadAttachmentBytes, validateAttachmentSize, type AttachmentMetadata, type AttachmentUpload } from "../core/attachment-upload.js";
import { requireConfig } from "../core/config.js";
import { EXIT_CODE } from "../core/constants.js";
import { CliError } from "../core/errors.js";
import { requestJson } from "../core/http.js";
import { logEvent, printJson, printOk } from "../core/output.js";
import type { ParsedArgs } from "../core/types.js";
import { resolveTodoId } from "./todos.js";

type AttachmentResult = {
  id: string;
  parentKind: "thought" | "todo" | "file";
  parentId: string;
  fileName: string;
  contentType: string;
  size: number;
  status: "uploaded";
  createdAt: number;
  updatedAt: number;
  url: string;
  publicUrl?: string | null;
  visibility?: "public" | "private";
};

export async function runAttachCommand(parsed: ParsedArgs) {
  const outputJson = hasFlag(parsed, "json");
  const makePublic = hasFlag(parsed, "public");
  const config = await requireConfig();

  if (parsed.positionals[1] === "list") {
    const listAll = hasFlag(parsed, "all");
    const todoIdInput = getStringOption(parsed, "id") ?? parsed.positionals[2] ?? null;
    if (!listAll && !todoIdInput) {
      throw new CliError("Usage: ibx attach list <todoId>.", {
        exitCode: EXIT_CODE.VALIDATION,
        code: "ATTACH_LIST_INPUT_REQUIRED",
      });
    }

    const todoId = listAll ? null : await resolveTodoId(config, todoIdInput as string);
    const query = listAll
      ? new URLSearchParams({ all: "true" })
      : new URLSearchParams({ parentKind: "todo", parentId: todoId as string });
    const { attachments } = await requestJson<{ attachments: AttachmentResult[] }>(
      config,
      `/api/attachments?${query.toString()}`,
      { method: "GET" },
      { action: "list attachments" },
    );

    if (outputJson) {
      printJson({ ...(todoId ? { todoId } : { all: true }), attachments });
      return;
    }

    for (const attachment of attachments) {
      printOk(`${attachment.fileName} ${attachment.url}`);
    }
    return;
  }

  const directory = getStringOption(parsed, "directory");
  const fileOption = getStringOption(parsed, "file");
  const positionalFileOnly = parsed.positionals.length === 2;
  const todoIdInput = getStringOption(parsed, "id") ?? (positionalFileOnly ? null : parsed.positionals[1] ?? null);
  const filePath = fileOption ?? (positionalFileOnly ? parsed.positionals[1] : parsed.positionals[2]) ?? null;

  if (!filePath) {
    throw new CliError("Usage: ibx attach <file> [--directory /path] [--public], or ibx attach <todoId> <file> [--public].", {
      exitCode: EXIT_CODE.VALIDATION,
      code: "ATTACH_INPUT_REQUIRED",
    });
  }

  const todoId = todoIdInput ? await resolveTodoId(config, todoIdInput) : null;
  const fileStats = await stat(filePath).catch(() => null);
  if (!fileStats?.isFile()) {
    throw new CliError(`Attachment file not found: ${filePath}`, {
      exitCode: EXIT_CODE.NOT_FOUND,
      code: "ATTACH_FILE_NOT_FOUND",
    });
  }

  if (todoId) validateAttachmentSize(fileStats.size, 30 * 1024 * 1024);
  const contentType = inferContentType(filePath);
  const metadata: AttachmentMetadata = {
    parentKind: todoId ? "todo" : "file", parentId: todoId ?? "library",
    ...(directory ? { directory } : {}), ...(makePublic ? { visibility: "public" } : {}),
    fileName: basename(filePath), contentType, size: fileStats.size,
  };
  const upload = await requestJson<AttachmentUpload>(
    config,
    "/api/attachments/upload-url",
    {
      method: "POST",
      body: JSON.stringify(metadata),
    },
    { action: "create attachment upload url" },
  );

  validateAttachmentSize(fileStats.size, upload.limits.maxBytes);
  const fileBytes = await readFile(filePath);
  const completion = await uploadAttachmentBytes(upload, metadata, fileBytes);

  const result = await requestJson<{
    ok: true;
    id: string;
    fileName: string;
    url: string;
    publicUrl?: string | null;
    visibility?: "public" | "private";
  }>(
    config,
    "/api/attachments",
    {
      method: "POST",
      body: JSON.stringify(completion),
    },
    { action: "save attachment metadata" },
  );

  if (makePublic && (result.visibility !== "public" || !result.publicUrl)) {
    throw new CliError(`File uploaded (${result.id}), but the server did not return a public link.`, {
      exitCode: EXIT_CODE.UNKNOWN, code: "ATTACH_PUBLIC_URL_MISSING", details: { id: result.id, uploaded: true },
    });
  }

  if (outputJson) {
    printJson({ ...result, ...(todoId ? { todoId } : { directory: directory ?? "/" }), contentType });
    return;
  }

  logEvent("info", "attach.upload", {
    id: result.id,
    ...(todoId ? { todoId } : { directory: directory ?? "/" }),
    contentType,
    size: fileStats.size,
  });
  const access = result.visibility === "public" ? "public" : result.visibility === "private" ? "private; owner sign-in required" : "server-provided URL";
  printOk(todoId
    ? `attached ${basename(filePath)} to ${todoId} (${access}): ${result.url}`
    : `uploaded ${basename(filePath)} to ${directory ?? "/"} (${access}): ${result.url}`);
}
