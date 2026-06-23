import { basename, extname } from "node:path";
import { readFile, stat } from "node:fs/promises";

import { getStringOption, hasFlag } from "../core/args.js";
import { requireConfig } from "../core/config.js";
import { EXIT_CODE } from "../core/constants.js";
import { CliError } from "../core/errors.js";
import { requestJson } from "../core/http.js";
import { logEvent, printJson, printOk } from "../core/output.js";
import type { ParsedArgs } from "../core/types.js";
import { resolveTodoId } from "./todos.js";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain",
  ".webp": "image/webp",
};

function inferContentType(path: string) {
  return MIME_BY_EXTENSION[extname(path).toLowerCase()] ?? "application/octet-stream";
}

export async function runAttachCommand(parsed: ParsedArgs) {
  const outputJson = hasFlag(parsed, "json");
  const config = await requireConfig();
  const todoIdInput = getStringOption(parsed, "id") ?? parsed.positionals[1] ?? null;
  const filePath = getStringOption(parsed, "file") ?? parsed.positionals[2] ?? null;

  if (!todoIdInput || !filePath) {
    throw new CliError("Usage: ibx attach <todoId> <file> or ibx attach --id <todoId> --file <path>.", {
      exitCode: EXIT_CODE.VALIDATION,
      code: "ATTACH_INPUT_REQUIRED",
    });
  }

  const todoId = await resolveTodoId(config, todoIdInput);
  const fileStats = await stat(filePath).catch(() => null);
  if (!fileStats?.isFile()) {
    throw new CliError(`Attachment file not found: ${filePath}`, {
      exitCode: EXIT_CODE.NOT_FOUND,
      code: "ATTACH_FILE_NOT_FOUND",
    });
  }

  const { uploadUrl, limits } = await requestJson<{
    uploadUrl: string;
    limits: { maxBytes: number; allowedContentTypes: string[] };
  }>(
    config,
    "/api/attachments/upload-url",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
    { action: "create attachment upload url" },
  );

  if (fileStats.size > limits.maxBytes) {
    throw new CliError(`Attachment exceeds ${limits.maxBytes} byte limit.`, {
      exitCode: EXIT_CODE.VALIDATION,
      code: "ATTACH_FILE_TOO_LARGE",
    });
  }

  const contentType = inferContentType(filePath);
  if (!limits.allowedContentTypes.includes(contentType)) {
    throw new CliError(`Unsupported attachment type: ${contentType}`, {
      exitCode: EXIT_CODE.VALIDATION,
      code: "ATTACH_FILE_TYPE_INVALID",
    });
  }

  const fileBytes = await readFile(filePath);
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: new Blob([new Uint8Array(fileBytes)], { type: contentType }),
  });
  const uploadJson = (await uploadResponse.json().catch(() => ({}))) as {
    storageId?: unknown;
  };
  if (!uploadResponse.ok || typeof uploadJson.storageId !== "string") {
    throw new CliError(`Attachment upload failed (${uploadResponse.status}).`, {
      exitCode: EXIT_CODE.SERVER,
      code: "ATTACH_UPLOAD_FAILED",
    });
  }

  const result = await requestJson<{ ok: true; id: string }>(
    config,
    "/api/attachments",
    {
      method: "POST",
      body: JSON.stringify({
        parentKind: "todo",
        parentId: todoId,
        storageId: uploadJson.storageId,
        fileName: basename(filePath),
        contentType,
        size: fileStats.size,
      }),
    },
    { action: "save attachment metadata" },
  );

  if (outputJson) {
    printJson({ ...result, todoId, fileName: basename(filePath), contentType });
    return;
  }

  logEvent("info", "attach.upload", {
    id: result.id,
    todoId,
    contentType,
    size: fileStats.size,
  });
  printOk(`attached ${basename(filePath)} to ${todoId}`);
}
