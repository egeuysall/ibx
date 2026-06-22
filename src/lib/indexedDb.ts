import {
  addOfflineQueuedPrompt,
  clearOfflineCachedTodos,
  clearOfflineThoughtsAndPrompts,
  getOfflineCachedTodos,
  listOfflineQueuedPrompts,
  listOfflineThoughts,
  patchOfflineQueuedPrompt,
  removeOfflineQueuedPrompt,
  setOfflineCachedTodos,
  upsertManyOfflineThoughts,
  upsertOfflineThought,
  type QueuedPrompt,
} from "@/lib/offline/db";
import type { LocalThought, TodoItem } from "@/lib/types";

export type { QueuedPrompt } from "@/lib/offline/db";

export async function listLocalThoughts() {
  return await listOfflineThoughts();
}

export async function upsertLocalThought(thought: LocalThought) {
  await upsertOfflineThought(thought);
}

export async function upsertManyLocalThoughts(thoughts: LocalThought[]) {
  await upsertManyOfflineThoughts(thoughts);
}

export async function clearLocalThoughts() {
  await clearOfflineThoughtsAndPrompts();
}

export async function listQueuedPrompts() {
  return await listOfflineQueuedPrompts();
}

export async function addQueuedPrompt(
  input: Pick<QueuedPrompt, "text" | "source"> & {
    id?: string;
    createdAt?: number;
  },
) {
  return await addOfflineQueuedPrompt(input);
}

export async function patchQueuedPrompt(
  id: string,
  patch: Partial<Pick<QueuedPrompt, "attempts" | "status" | "lastError">>,
) {
  return await patchOfflineQueuedPrompt(id, patch);
}

export async function removeQueuedPrompt(id: string) {
  await removeOfflineQueuedPrompt(id);
}

export async function getCachedTodos() {
  return await getOfflineCachedTodos();
}

export async function setCachedTodos(todos: TodoItem[]) {
  await setOfflineCachedTodos(todos);
}

export async function clearCachedTodos() {
  await clearOfflineCachedTodos();
}
