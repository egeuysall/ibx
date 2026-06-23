import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sessions: defineTable({
    tokenHash: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_expiresAt", ["expiresAt"]),
  apiKeys: defineTable({
    ownerKey: v.optional(v.union(v.string(), v.null())),
    name: v.string(),
    keyHash: v.string(),
    prefix: v.string(),
    last4: v.string(),
    permission: v.optional(
      v.union(v.literal("read"), v.literal("write"), v.literal("both")),
    ),
    createdAt: v.number(),
    revokedAt: v.union(v.number(), v.null()),
  })
    .index("by_keyHash", ["keyHash"])
    .index("by_ownerKey_and_createdAt", ["ownerKey", "createdAt"])
    .index("by_createdAt", ["createdAt"])
    .index("by_revokedAt_and_createdAt", ["revokedAt", "createdAt"]),
  cliAuthCodes: defineTable({
    ownerKey: v.union(v.string(), v.null()),
    codeHash: v.string(),
    codeChallenge: v.string(),
    redirectUri: v.string(),
    state: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    consumedAt: v.union(v.number(), v.null()),
  })
    .index("by_codeHash", ["codeHash"])
    .index("by_expiresAt", ["expiresAt"]),
  thoughts: defineTable({
    ownerKey: v.optional(v.union(v.string(), v.null())),
    externalId: v.string(),
    rawText: v.string(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    version: v.optional(v.number()),
    deletedAt: v.optional(v.union(v.number(), v.null())),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("done"),
      v.literal("failed"),
    ),
    synced: v.boolean(),
    aiRunId: v.union(v.string(), v.null()),
  })
    .index("by_externalId", ["externalId"])
    .index("by_ownerKey_and_externalId", ["ownerKey", "externalId"])
    .index("by_ownerKey_and_createdAt", ["ownerKey", "createdAt"])
    .index("by_createdAt", ["createdAt"]),
  todos: defineTable({
    ownerKey: v.optional(v.union(v.string(), v.null())),
    thoughtId: v.id("thoughts"),
    thoughtExternalId: v.optional(v.string()),
    externalId: v.optional(v.string()),
    title: v.string(),
    notes: v.union(v.string(), v.null()),
    notesJson: v.optional(v.union(v.string(), v.null())),
    notesHtml: v.optional(v.union(v.string(), v.null())),
    status: v.union(v.literal("open"), v.literal("done")),
    dueDate: v.optional(v.union(v.number(), v.null())),
    estimatedHours: v.optional(v.union(v.number(), v.null())),
    timeBlockStart: v.optional(v.union(v.number(), v.null())),
    priority: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3))),
    recurrence: v.optional(
      v.union(
        v.literal("none"),
        v.literal("daily"),
        v.literal("weekly"),
        v.literal("monthly"),
      ),
    ),
    source: v.optional(v.union(v.literal("ai"), v.literal("manual"))),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    version: v.optional(v.number()),
    deletedAt: v.optional(v.union(v.number(), v.null())),
  })
    .index("by_ownerKey_and_createdAt", ["ownerKey", "createdAt"])
    .index("by_ownerKey_and_updatedAt", ["ownerKey", "updatedAt"])
    .index("by_ownerKey_and_externalId", ["ownerKey", "externalId"])
    .index("by_thoughtId_and_createdAt", ["thoughtId", "createdAt"])
    .index("by_createdAt", ["createdAt"]),
  syncOperations: defineTable({
    ownerKey: v.optional(v.union(v.string(), v.null())),
    opId: v.string(),
    clientId: v.string(),
    entityType: v.union(v.literal("todo"), v.literal("thought")),
    entityId: v.string(),
    operation: v.union(
      v.literal("create"),
      v.literal("update"),
      v.literal("delete"),
      v.literal("toggle"),
    ),
    status: v.union(
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("conflict"),
    ),
    serverId: v.union(v.string(), v.null()),
    message: v.union(v.string(), v.null()),
    createdAt: v.number(),
  })
    .index("by_ownerKey_and_opId", ["ownerKey", "opId"])
    .index("by_ownerKey_and_createdAt", ["ownerKey", "createdAt"]),
  attachments: defineTable({
    ownerKey: v.optional(v.union(v.string(), v.null())),
    parentKind: v.union(v.literal("thought"), v.literal("todo")),
    parentId: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    status: v.union(
      v.literal("uploaded"),
      v.literal("pendingDelete"),
      v.literal("deleted"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.union(v.number(), v.null())),
  })
    .index("by_parentKind_and_parentId_and_createdAt", [
      "parentKind",
      "parentId",
      "createdAt",
    ])
    .index("by_ownerKey_and_parentKind_and_parentId_and_createdAt", [
      "ownerKey",
      "parentKind",
      "parentId",
      "createdAt",
    ])
    .index("by_ownerKey_and_storageId", ["ownerKey", "storageId"])
    .index("by_ownerKey_and_createdAt", ["ownerKey", "createdAt"]),
  memories: defineTable({
    key: v.string(),
    kind: v.union(v.literal("profile"), v.literal("run")),
    content: v.string(),
    runExternalId: v.union(v.string(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_kind_and_updatedAt", ["kind", "updatedAt"])
    .index("by_updatedAt", ["updatedAt"]),
});
