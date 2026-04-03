import type { LocalThought } from "@/lib/types";

const DB_NAME = "ibx-db";
const DB_VERSION = 2;
const THOUGHTS_STORE = "localThoughts";
const PROMPTS_STORE = "queuedPrompts";

export type QueuedPrompt = {
  id: string;
  text: string;
  source: "app" | "shortcut";
  createdAt: number;
  attempts: number;
  status: "pending" | "processing" | "failed";
  lastError: string | null;
};

let cachedDbPromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (cachedDbPromise) {
    return cachedDbPromise;
  }

  cachedDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(THOUGHTS_STORE)) {
        const store = db.createObjectStore(THOUGHTS_STORE, {
          keyPath: "externalId",
        });
        store.createIndex("by_createdAt", "createdAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(PROMPTS_STORE)) {
        const promptStore = db.createObjectStore(PROMPTS_STORE, {
          keyPath: "id",
        });
        promptStore.createIndex("by_createdAt", "createdAt", { unique: false });
        promptStore.createIndex("by_status", "status", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return cachedDbPromise;
}

async function withStore<T>(
  storeName: typeof THOUGHTS_STORE | typeof PROMPTS_STORE,
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore, resolve: (value: T) => void, reject: (error: unknown) => void) => void,
) {
  const db = await openDatabase();

  return await new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    handler(store, resolve, reject);
  });
}

export async function listLocalThoughts() {
  return withStore<LocalThought[]>(THOUGHTS_STORE, "readonly", (store, resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const rows = (request.result as LocalThought[]).toSorted((a, b) => b.createdAt - a.createdAt);
      resolve(rows);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function upsertLocalThought(thought: LocalThought) {
  return withStore<void>(THOUGHTS_STORE, "readwrite", (store, resolve, reject) => {
    const request = store.put(thought);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function upsertManyLocalThoughts(thoughts: LocalThought[]) {
  if (thoughts.length === 0) {
    return;
  }

  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(THOUGHTS_STORE, "readwrite");
    const store = transaction.objectStore(THOUGHTS_STORE);

    for (const thought of thoughts) {
      store.put(thought);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function clearLocalThoughts() {
  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([THOUGHTS_STORE, PROMPTS_STORE], "readwrite");
    transaction.objectStore(THOUGHTS_STORE).clear();
    transaction.objectStore(PROMPTS_STORE).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function listQueuedPrompts() {
  return withStore<QueuedPrompt[]>(PROMPTS_STORE, "readonly", (store, resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const rows = (request.result as QueuedPrompt[]).toSorted((a, b) => a.createdAt - b.createdAt);
      resolve(rows);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function addQueuedPrompt(
  input: Pick<QueuedPrompt, "text" | "source"> & { id?: string; createdAt?: number },
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

  return withStore<QueuedPrompt>(PROMPTS_STORE, "readwrite", (store, resolve, reject) => {
    const request = store.put(prompt);
    request.onsuccess = () => resolve(prompt);
    request.onerror = () => reject(request.error);
  });
}

export async function patchQueuedPrompt(
  id: string,
  patch: Partial<Pick<QueuedPrompt, "attempts" | "status" | "lastError">>,
) {
  return withStore<QueuedPrompt | null>(PROMPTS_STORE, "readwrite", (store, resolve, reject) => {
    const request = store.get(id);

    request.onsuccess = () => {
      const current = request.result as QueuedPrompt | undefined;
      if (!current) {
        resolve(null);
        return;
      }

      const nextValue: QueuedPrompt = {
        ...current,
        ...patch,
      };

      const putRequest = store.put(nextValue);
      putRequest.onsuccess = () => resolve(nextValue);
      putRequest.onerror = () => reject(putRequest.error);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function removeQueuedPrompt(id: string) {
  return withStore<void>(PROMPTS_STORE, "readwrite", (store, resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
