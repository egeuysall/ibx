import Dexie, { type Table } from "dexie";

import type { LocalThought, TodoItem } from "@/lib/types";

export type QueuedPrompt = {
  id: string;
  text: string;
  source: "app" | "shortcut";
  createdAt: number;
  attempts: number;
  status: "pending" | "processing" | "failed";
  lastError: string | null;
};

export type PendingOfflineOperation = {
  id: string;
  entity: "thought" | "todo" | "attachment" | "publication";
  entityId: string;
  kind: "create" | "update" | "delete" | "toggle" | "publish" | "upload";
  payload: unknown;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  lastError: string | null;
};

export type OfflineAttachment = {
  id: string;
  parentKind: "thought" | "todo";
  parentId: string;
  fileName: string;
  contentType: string;
  size: number;
  blob?: Blob;
  storageId: string | null;
  status: "local" | "uploading" | "uploaded" | "error";
  createdAt: number;
  updatedAt: number;
  lastError: string | null;
};

type CachedTodosRecord = {
  id: string;
  todos: TodoItem[];
  updatedAt: number;
};

type SyncMetaRecord = {
  key: string;
  value: string | number | boolean | null;
  updatedAt: number;
};

const TODOS_CACHE_KEY = "latest";

class IbxOfflineDatabase extends Dexie {
  localThoughts!: Table<LocalThought, string>;
  queuedPrompts!: Table<QueuedPrompt, string>;
  cachedTodos!: Table<CachedTodosRecord, string>;
  pendingOps!: Table<PendingOfflineOperation, string>;
  attachments!: Table<OfflineAttachment, string>;
  syncMeta!: Table<SyncMetaRecord, string>;

  constructor() {
    super("ibx-db");

    this.version(3).stores({
      localThoughts: "externalId, createdAt",
      queuedPrompts: "id, createdAt, status",
      cachedTodos: "id",
    });

    this.version(4).stores({
      localThoughts: "externalId, createdAt",
      queuedPrompts: "id, createdAt, status",
      cachedTodos: "id, updatedAt",
      pendingOps: "id, entity, entityId, createdAt, updatedAt",
      attachments: "id, parentKind, parentId, status, createdAt, updatedAt",
      syncMeta: "key, updatedAt",
    });
  }
}

let db: IbxOfflineDatabase | null = null;

export function getOfflineDatabase() {
  if (typeof indexedDB === "undefined") {
    throw new Error("Offline database is only available in the browser.");
  }

  db ??= new IbxOfflineDatabase();
  return db;
}

export async function listOfflineThoughts() {
  return await getOfflineDatabase()
    .localThoughts.orderBy("createdAt")
    .reverse()
    .toArray();
}

export async function upsertOfflineThought(thought: LocalThought) {
  await getOfflineDatabase().localThoughts.put(thought);
}

export async function upsertManyOfflineThoughts(thoughts: LocalThought[]) {
  if (thoughts.length === 0) {
    return;
  }

  await getOfflineDatabase().localThoughts.bulkPut(thoughts);
}

export async function clearOfflineThoughtsAndPrompts() {
  const database = getOfflineDatabase();
  await database.transaction(
    "rw",
    database.localThoughts,
    database.queuedPrompts,
    async () => {
      await database.localThoughts.clear();
      await database.queuedPrompts.clear();
    },
  );
}

export async function listOfflineQueuedPrompts() {
  return await getOfflineDatabase().queuedPrompts.orderBy("createdAt").toArray();
}

export async function addOfflineQueuedPrompt(
  input: Pick<QueuedPrompt, "text" | "source"> & {
    id?: string;
    createdAt?: number;
  },
) {
  const prompt: QueuedPrompt = {
    id: input.id ?? crypto.randomUUID(),
    text: input.text,
    source: input.source,
    createdAt: input.createdAt ?? Date.now(),
    attempts: 0,
    status: "pending",
    lastError: null,
  };

  await getOfflineDatabase().queuedPrompts.put(prompt);
  return prompt;
}

export async function patchOfflineQueuedPrompt(
  id: string,
  patch: Partial<Pick<QueuedPrompt, "attempts" | "status" | "lastError">>,
) {
  const table = getOfflineDatabase().queuedPrompts;
  const current = await table.get(id);
  if (!current) {
    return null;
  }

  const nextValue: QueuedPrompt = {
    ...current,
    ...patch,
  };

  await table.put(nextValue);
  return nextValue;
}

export async function removeOfflineQueuedPrompt(id: string) {
  await getOfflineDatabase().queuedPrompts.delete(id);
}

export async function getOfflineCachedTodos() {
  const row = await getOfflineDatabase().cachedTodos.get(TODOS_CACHE_KEY);
  return Array.isArray(row?.todos) ? row.todos : [];
}

export async function setOfflineCachedTodos(todos: TodoItem[]) {
  await getOfflineDatabase().cachedTodos.put({
    id: TODOS_CACHE_KEY,
    todos,
    updatedAt: Date.now(),
  });
}

export async function clearOfflineCachedTodos() {
  await getOfflineDatabase().cachedTodos.delete(TODOS_CACHE_KEY);
}

export async function enqueueOfflineOperation(
  input: Omit<
    PendingOfflineOperation,
    "id" | "createdAt" | "updatedAt" | "attempts" | "lastError"
  > & {
    id?: string;
    createdAt?: number;
  },
) {
  const now = Date.now();
  const operation: PendingOfflineOperation = {
    ...input,
    id: input.id ?? crypto.randomUUID(),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    attempts: 0,
    lastError: null,
  };

  await getOfflineDatabase().pendingOps.put(operation);
  return operation;
}

export async function listPendingOfflineOperations(limit = 50) {
  return await getOfflineDatabase()
    .pendingOps.orderBy("createdAt")
    .limit(limit)
    .toArray();
}

export async function removeOfflineOperation(id: string) {
  await getOfflineDatabase().pendingOps.delete(id);
}

export async function listOfflineAttachments(
  parentKind: OfflineAttachment["parentKind"],
  parentId: string,
) {
  return await getOfflineDatabase()
    .attachments.where({ parentKind, parentId })
    .toArray();
}

export async function upsertOfflineAttachment(attachment: OfflineAttachment) {
  await getOfflineDatabase().attachments.put(attachment);
}

export async function upsertManyOfflineAttachments(
  attachments: OfflineAttachment[],
) {
  if (attachments.length === 0) {
    return;
  }

  await getOfflineDatabase().attachments.bulkPut(attachments);
}

export async function patchOfflineAttachment(
  id: string,
  patch: Partial<Omit<OfflineAttachment, "id">>,
) {
  const table = getOfflineDatabase().attachments;
  const current = await table.get(id);
  if (!current) {
    return null;
  }

  const nextValue: OfflineAttachment = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  };
  await table.put(nextValue);
  return nextValue;
}
