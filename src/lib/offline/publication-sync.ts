import { ApiError, apiClient } from "@/lib/apiClient";
import {
  listPendingOfflineOperations,
  patchOfflineOperation,
  removeOfflineOperation,
} from "@/lib/offline/db";

function parseErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

function readPayload(operation: { payload: unknown }) {
  return operation.payload && typeof operation.payload === "object"
    ? (operation.payload as Record<string, unknown>)
    : {};
}

export async function flushPendingPublicationOperations() {
  const pendingOperations = await listPendingOfflineOperations(50).catch(
    () => [],
  );
  const publicationOperations = pendingOperations.filter(
    (operation) => operation.entity === "publication",
  );

  let published = 0;
  let unpublished = 0;
  let paused = false;

  for (const operation of publicationOperations) {
    const payload = readPayload(operation);
    const sourceKind =
      payload.sourceKind === "todo" || payload.sourceKind === "thought"
        ? payload.sourceKind
        : null;
    const sourceId = typeof payload.sourceId === "string" ? payload.sourceId : null;

    if (!sourceKind || !sourceId || sourceId.startsWith("local-")) {
      continue;
    }

    try {
      if (operation.kind === "publish") {
        const title = typeof payload.title === "string" ? payload.title : "";
        if (!title.trim()) {
          throw new Error("Publication title is required.");
        }

        await apiClient.publishToBri({
          sourceKind,
          sourceId,
          title,
          notes: typeof payload.notes === "string" ? payload.notes : null,
          notesJson: payload.notesJson,
          visibility: payload.visibility === "private" ? "private" : "public",
        });
        await removeOfflineOperation(operation.id);
        published += 1;
        continue;
      }

      if (operation.kind === "delete") {
        await apiClient.unpublishFromBri(sourceKind, sourceId);
        await removeOfflineOperation(operation.id);
        unpublished += 1;
        continue;
      }

      await patchOfflineOperation(operation.id, {
        attempts: operation.attempts + 1,
        lastError: "Unsupported publication operation.",
      }).catch(() => undefined);
    } catch (error) {
      if (error instanceof ApiError && error.isNetworkError) {
        paused = true;
        break;
      }

      await patchOfflineOperation(operation.id, {
        attempts: operation.attempts + 1,
        lastError: parseErrorMessage(error),
      }).catch(() => undefined);
    }
  }

  return { published, unpublished, paused };
}
