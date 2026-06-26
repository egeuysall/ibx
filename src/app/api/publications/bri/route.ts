import { NextRequest, NextResponse } from "next/server";

import {
  decryptBriApiKey,
  normalizeBriApiKey,
  readBriBaseUrl,
  readConvexServerSecret,
} from "@/lib/bri-connection";
import {
  getRouteAuth,
  getRouteAuthOwnerKey,
  unauthorizedJson,
  validateApiKeyPermission,
  validateCsrfForSessionAuth,
} from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";
import { tiptapJsonToMarkdown } from "@/lib/tiptap-markdown";

const MAX_TITLE_LENGTH = 120;
const MAX_MARKDOWN_LENGTH = 200_000;

type BriNoteResponse = {
  data?: {
    id?: unknown;
    noteId?: unknown;
    username?: unknown;
    owner?: { username?: unknown };
    user?: { username?: unknown };
    slug?: unknown;
    title?: unknown;
    note?: {
      id?: unknown;
      noteId?: unknown;
      username?: unknown;
      owner?: { username?: unknown };
      user?: { username?: unknown };
      slug?: unknown;
      title?: unknown;
    };
  };
  error?: unknown;
};

class BriRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BriRequestError";
  }
}

function normalizeSourceKind(input: unknown) {
  return input === "todo" || input === "thought" ? input : null;
}

function normalizeSourceId(input: unknown) {
  const value = typeof input === "string" ? input.trim() : "";
  if (!value || value.length > 128) {
    return null;
  }

  return value;
}

function normalizeTitle(input: unknown) {
  return typeof input === "string"
    ? input.trim().replace(/\s+/g, " ").slice(0, MAX_TITLE_LENGTH)
    : "";
}

function normalizeVisibility(input: unknown) {
  return input === "private" ? "private" : "public";
}

function readOwnerApiKeys() {
  const raw = process.env.BRI_INTERNAL_API_KEYS_JSON?.trim();
  if (!raw) {
    return new Map<string, string>();
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const entries: Array<[string, string]> = [];
    for (const [rawOwnerKey, rawApiKey] of Object.entries(parsed)) {
      const ownerKey = rawOwnerKey.trim();
      const apiKey = typeof rawApiKey === "string" ? rawApiKey.trim() : "";
      if (!ownerKey || !apiKey) {
        return null;
      }
      entries.push([ownerKey, apiKey]);
    }

    return new Map(entries);
  } catch {
    return null;
  }
}

async function readBriConfig(ownerKey: string | null) {
  const baseUrl = readBriBaseUrl();
  if (!baseUrl) {
    return {
      error: "Bri base URL is not configured.",
      status: 503,
    } as const;
  }

  const serverSecret = readConvexServerSecret();
  if (serverSecret) {
    const connection = await convex.query(api.briConnections.get, {
      ownerKey,
      serverSecret,
    });
    if (connection) {
      const apiKey = decryptBriApiKey(connection);
      if (!apiKey || !normalizeBriApiKey(apiKey)) {
        return {
          error: "Saved Bri connection could not be decrypted. Reconnect Bri in Settings.",
          status: 503,
        } as const;
      }

      return { config: { baseUrl, apiKey } } as const;
    }
  }

  if (ownerKey) {
    const ownerApiKeys = readOwnerApiKeys();
    if (ownerApiKeys === null) {
      return {
        error: "Bri owner API key configuration is invalid.",
        status: 503,
      } as const;
    }

    const ownerApiKey = ownerApiKeys.get(ownerKey);
    if (ownerApiKey && normalizeBriApiKey(ownerApiKey)) {
      return { config: { baseUrl, apiKey: ownerApiKey } } as const;
    }

    return {
      error: serverSecret
        ? "Connect Bri in Settings before publishing."
        : "Bri secure connection support is not configured. Restart the app after setting IBX_CONVEX_SERVER_SECRET.",
      status: 503,
    } as const;
  }

  const apiKey = process.env.BRI_INTERNAL_API_KEY?.trim();
  if (!apiKey) {
    return {
      error: "Bri publishing is not configured for this auth mode.",
      status: 503,
    } as const;
  }

  if (!normalizeBriApiKey(apiKey)) {
    return {
      error: "Bri internal API key is invalid.",
      status: 503,
    } as const;
  }

  return { config: { baseUrl, apiKey } } as const;
}

function serializePublication(publication: {
  _id: string;
  sourceKind: "todo" | "thought";
  sourceId: string;
  target: "bri";
  remoteId: string;
  username: string;
  slug: string;
  title: string;
  url: string;
  visibility: "public" | "private";
  status: "published" | "deleted";
  createdAt: number;
  updatedAt: number;
  lastPublishedAt: number;
  deletedAt?: number | null;
}) {
  return {
    id: publication._id,
    sourceKind: publication.sourceKind,
    sourceId: publication.sourceId,
    target: publication.target,
    remoteId: publication.remoteId,
    username: publication.username,
    slug: publication.slug,
    title: publication.title,
    url: publication.url,
    visibility: publication.visibility,
    status: publication.status,
    createdAt: publication.createdAt,
    updatedAt: publication.updatedAt,
    lastPublishedAt: publication.lastPublishedAt,
    deletedAt: publication.deletedAt ?? null,
  };
}

async function readBriJson(response: Response) {
  return (await response.json().catch(() => ({}))) as BriNoteResponse;
}

function readString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

async function resolveAttachmentImageUrls(
  markdown: string,
  ownerKey: string | null,
) {
  const attachmentIds = new Set<string>();
  const attachmentUrlPattern =
    /!\[([^\]]*)\]\((\/api\/attachments\/([^/)]+)\/file)(?:\s+"([^"]*)")?\)/g;

  for (const match of markdown.matchAll(attachmentUrlPattern)) {
    const attachmentId = decodeURIComponent(match[3] ?? "").trim();
    if (attachmentId && attachmentId.length <= 128) {
      attachmentIds.add(attachmentId);
    }
  }

  if (attachmentIds.size === 0) {
    return markdown;
  }

  const urlByAttachmentId = new Map<string, string>();
  await Promise.all(
    [...attachmentIds].map(async (attachmentId) => {
      const url = await convex
        .query(api.attachments.getAttachmentUrl, {
          ownerKey,
          attachmentId: attachmentId as never,
        })
        .catch(() => null);
      if (url) {
        urlByAttachmentId.set(attachmentId, url);
      }
    }),
  );

  return markdown.replace(
    attachmentUrlPattern,
    (fullMatch, alt: string, _localUrl: string, encodedId: string, title?: string) => {
      const attachmentId = decodeURIComponent(encodedId).trim();
      const resolvedUrl = urlByAttachmentId.get(attachmentId);
      if (!resolvedUrl) {
        return fullMatch;
      }

      return `![${alt}](${resolvedUrl}${title ? ` "${title}"` : ""})`;
    },
  );
}

function getReferencedAttachmentIds(markdown: string) {
  const attachmentIds = new Set<string>();
  const attachmentUrlPattern = /!\[[^\]]*\]\(\/api\/attachments\/([^/)]+)\/file/g;

  for (const match of markdown.matchAll(attachmentUrlPattern)) {
    const attachmentId = decodeURIComponent(match[1] ?? "").trim();
    if (attachmentId && attachmentId.length <= 128) {
      attachmentIds.add(attachmentId);
    }
  }

  return attachmentIds;
}

async function appendImageAttachments(
  markdown: string,
  ownerKey: string | null,
  sourceId: string,
  referencedAttachmentIds: Set<string>,
) {
  const attachments = await convex
    .query(api.attachments.listAttachments, {
      ownerKey,
      parentKind: "todo",
      parentId: sourceId,
      limit: 100,
    })
    .catch(() => []);
  const imageLines: string[] = [];

  for (const attachment of attachments) {
    const attachmentId = String(attachment._id);
    const contentType =
      typeof attachment.contentType === "string"
        ? attachment.contentType.toLowerCase()
        : "";
    if (
      referencedAttachmentIds.has(attachmentId) ||
      !contentType.startsWith("image/")
    ) {
      continue;
    }

    const url = await convex
      .query(api.attachments.getAttachmentUrl, {
        ownerKey,
        attachmentId: attachment._id,
      })
      .catch(() => null);
    if (url) {
      const alt = attachment.fileName.replace(/[\[\]\n]/g, " ");
      imageLines.push(`![${alt}](${url})`);
    }
  }

  if (imageLines.length === 0) {
    return markdown;
  }

  return `${markdown.trim()}\n\n${imageLines.join("\n\n")}`;
}

async function sendBriRequest(input: {
  method: "POST" | "PATCH";
  path: string;
  apiKey: string;
  title: string;
  content: string;
  visibility: "public" | "private";
  fallback?: {
    remoteId?: string | null;
    username?: string | null;
    slug?: string | null;
    title?: string | null;
  };
}) {
  const response = await fetch(input.path, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      visibility: input.visibility,
      expiresInDays: null,
    }),
  });
  const json = await readBriJson(response);
  if (!response.ok) {
    const message =
      typeof json.error === "string" ? json.error : "Bri publication failed.";
    throw new BriRequestError(message, response.status);
  }

  const data = json.data;
  const note = data?.note;
  const remoteId = readString(
    data?.id,
    data?.noteId,
    note?.id,
    note?.noteId,
    input.fallback?.remoteId,
  );
  const username = readString(
    data?.username,
    data?.owner?.username,
    data?.user?.username,
    note?.username,
    note?.owner?.username,
    note?.user?.username,
    input.fallback?.username,
  );
  const slug = readString(data?.slug, note?.slug, input.fallback?.slug);
  const title =
    readString(data?.title, note?.title, input.fallback?.title) ?? input.title;
  if (!remoteId || !username || !slug) {
    throw new Error("Bri returned incomplete publication metadata.");
  }

  return { remoteId, username, slug, title };
}

export async function GET(request: NextRequest) {
  const auth = await getRouteAuth(request);
  if (!auth) {
    return unauthorizedJson();
  }
  const permissionError = validateApiKeyPermission(request, auth);
  if (permissionError) {
    return permissionError;
  }

  const sourceKind = normalizeSourceKind(
    request.nextUrl.searchParams.get("sourceKind"),
  );
  const sourceId = normalizeSourceId(request.nextUrl.searchParams.get("sourceId"));
  if (!sourceKind || !sourceId) {
    return NextResponse.json(
      { error: "sourceKind and sourceId are required." },
      { status: 400 },
    );
  }

  const ownerKey = getRouteAuthOwnerKey(auth);
  const publication = await convex.query(api.publications.getBySource, {
    ownerKey,
    sourceKind,
    sourceId,
  });

  return NextResponse.json({
    publication: publication ? serializePublication(publication) : null,
  });
}

export async function POST(request: NextRequest) {
  const auth = await getRouteAuth(request);
  if (!auth) {
    return unauthorizedJson();
  }
  const csrfError = validateCsrfForSessionAuth(request, auth);
  if (csrfError) {
    return csrfError;
  }
  const permissionError = validateApiKeyPermission(request, auth);
  if (permissionError) {
    return permissionError;
  }

  const ownerKey = getRouteAuthOwnerKey(auth);
  const configResult = await readBriConfig(ownerKey);
  if ("error" in configResult) {
    return NextResponse.json(
      { error: configResult.error },
      { status: configResult.status },
    );
  }
  const { config } = configResult;

  const body = (await request.json().catch(() => null)) as {
    sourceKind?: unknown;
    sourceId?: unknown;
    title?: unknown;
    notes?: unknown;
    notesJson?: unknown;
    visibility?: unknown;
  } | null;

  const sourceKind = normalizeSourceKind(body?.sourceKind);
  const sourceId = normalizeSourceId(body?.sourceId);
  const title = normalizeTitle(body?.title);
  const visibility = normalizeVisibility(body?.visibility);
  const fallbackNotes = typeof body?.notes === "string" ? body.notes : null;
  let parsedJson: unknown = body?.notesJson;
  if (typeof body?.notesJson === "string") {
    try {
      parsedJson = JSON.parse(body.notesJson || "null");
    } catch {
      parsedJson = null;
    }
  }
  let markdown = tiptapJsonToMarkdown(parsedJson, fallbackNotes).slice(
    0,
    MAX_MARKDOWN_LENGTH,
  );

  if (!sourceKind || !sourceId) {
    return NextResponse.json(
      { error: "sourceKind and sourceId are required." },
      { status: 400 },
    );
  }
  if (sourceKind !== "todo") {
    return NextResponse.json(
      { error: "Only todo publishing is supported." },
      { status: 400 },
    );
  }
  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }
  if (!markdown.trim()) {
    markdown = `# ${title}`;
  }

  const sourceTodo = await convex.query(api.todos.getByStringId, {
    ownerKey,
    todoId: sourceId,
  });
  if (!sourceTodo) {
    return NextResponse.json({ error: "Todo not found." }, { status: 404 });
  }

  const existing = await convex.query(api.publications.getBySource, {
    ownerKey,
    sourceKind,
    sourceId,
  });
  const referencedAttachmentIds = getReferencedAttachmentIds(markdown);
  const markdownWithAttachments = await appendImageAttachments(
    markdown,
    ownerKey,
    sourceId,
    referencedAttachmentIds,
  );
  const resolvedMarkdown = await resolveAttachmentImageUrls(
    markdownWithAttachments,
    ownerKey,
  );
  const content = resolvedMarkdown.trim();

  try {
    let briResult: Awaited<ReturnType<typeof sendBriRequest>>;
    if (existing?.status === "published" && existing.remoteId) {
      try {
        briResult = await sendBriRequest({
          method: "PATCH",
          path: `${config.baseUrl}/api/notes/by-id/${existing.remoteId}`,
          apiKey: config.apiKey,
          title,
          content,
          visibility,
          fallback: {
            remoteId: existing.remoteId,
            username: existing.username,
            slug: existing.slug,
            title: existing.title,
          },
        });
      } catch (error) {
        if (
          error instanceof BriRequestError &&
          (error.status === 404 || error.message.toLowerCase().includes("not found"))
        ) {
          briResult = await sendBriRequest({
            method: "POST",
            path: `${config.baseUrl}/api/notes`,
            apiKey: config.apiKey,
            title,
            content,
            visibility,
          });
        } else {
          throw error;
        }
      }
    } else {
      briResult = await sendBriRequest({
        method: "POST",
        path: `${config.baseUrl}/api/notes`,
        apiKey: config.apiKey,
        title,
        content,
        visibility,
      });
    }

    const url = `${config.baseUrl}/${briResult.username}/${briResult.slug}`;
    await convex.mutation(api.publications.upsertBriPublication, {
      ownerKey,
      sourceKind,
      sourceId,
      remoteId: briResult.remoteId,
      username: briResult.username,
      slug: briResult.slug,
      title: briResult.title,
      url,
      visibility,
    });

    const publication = await convex.query(api.publications.getBySource, {
      ownerKey,
      sourceKind,
      sourceId,
    });

    if (!publication) {
      return NextResponse.json(
        { error: "Publication metadata was not saved." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      publication: serializePublication(publication),
    });
  } catch (error) {
    const status =
      error instanceof BriRequestError && error.status >= 400 && error.status < 500
        ? error.status
        : 502;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Bri publication failed.",
      },
      { status },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getRouteAuth(request);
  if (!auth) {
    return unauthorizedJson();
  }
  const csrfError = validateCsrfForSessionAuth(request, auth);
  if (csrfError) {
    return csrfError;
  }
  const permissionError = validateApiKeyPermission(request, auth);
  if (permissionError) {
    return permissionError;
  }

  const ownerKey = getRouteAuthOwnerKey(auth);
  const configResult = await readBriConfig(ownerKey);
  if ("error" in configResult) {
    return NextResponse.json(
      { error: configResult.error },
      { status: configResult.status },
    );
  }
  const { config } = configResult;

  const sourceKind = normalizeSourceKind(
    request.nextUrl.searchParams.get("sourceKind"),
  );
  const sourceId = normalizeSourceId(request.nextUrl.searchParams.get("sourceId"));
  if (!sourceKind || !sourceId) {
    return NextResponse.json(
      { error: "sourceKind and sourceId are required." },
      { status: 400 },
    );
  }

  const existing = await convex.query(api.publications.getBySource, {
    ownerKey,
    sourceKind,
    sourceId,
  });
  if (!existing || existing.status !== "published") {
    return NextResponse.json({ ok: true });
  }

  const response = await fetch(
    `${config.baseUrl}/api/notes/by-id/${existing.remoteId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "softDelete" }),
    },
  );
  if (!response.ok) {
    const json = await readBriJson(response);
    return NextResponse.json(
      {
        error:
          typeof json.error === "string" ? json.error : "Bri unpublish failed.",
      },
      { status: 502 },
    );
  }

  await convex.mutation(api.publications.markDeleted, {
    ownerKey,
    sourceKind,
    sourceId,
  });

  return NextResponse.json({ ok: true });
}
