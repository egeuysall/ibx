# IBX Implementation Summary

## Completed in This Pass

- Fixed the production redirect loop by making the landing page and protected app pages use the same server session resolver, and by removing the proxy-level `/app` to `/` redirect that could disagree with the page guard.
- Added `IMPLEMENTATION_PLAN.md` with the requested architecture, data model, offline sync, Bri, Tiptap, CLI auth, iOS, and Convex cost-control plan.
- Installed Dexie and replaced the hand-written IndexedDB internals with a Dexie-backed compatibility layer.
- Added structured offline tables for queued prompts, cached todos, pending operations, attachments, and sync metadata.
- Made web manual todo add offline-capable:
  - creates a local todo immediately while offline,
  - caches it in the existing todo cache path,
  - queues an idempotent pending create operation,
  - flushes queued manual creates when the app is authenticated and online,
  - falls back to local queueing when a stale online state produces a network error.
- Added the first real Convex sync protocol slice:
  - widened thoughts and todos with `updatedAt`, `version`, and `deletedAt`,
  - added `syncOperations` idempotency records,
  - added `convex/sync.ts` with bounded `syncPush` and `syncPull`,
  - added `/api/sync` with existing Clerk/API-key auth and CSRF behavior,
  - changed the web pending-operation flusher to use `/api/sync`.
- Added the first IBX Tiptap slice:
  - ran `npx @tiptap/cli@latest add simple-editor`,
  - added Tiptap dependencies and generated source components,
  - scoped the generated Simple Editor styles so they do not override IBX globals,
  - made `SimpleEditor` reusable with value, placeholder, embedded mode, and text/JSON/HTML change output,
  - replaced textarea usage in `ThoughtComposer` and `TodosPanel` with the Tiptap editor while preserving the existing plain-text save contract.
- Added the first Convex attachment slice:
  - added an `attachments` table with owner, parent, storage ID, metadata, status, timestamps, and bounded indexes,
  - added Convex storage functions for upload URL generation, metadata creation, listing, signed URL lookup, and delete,
  - added authenticated Next routes at `/api/attachments`, `/api/attachments/upload-url`, `/api/attachments/[attachmentId]`, and `/api/attachments/[attachmentId]/url`,
  - added client helpers for upload/list/url/delete and Dexie helpers for offline attachment metadata,
  - enforced server-side owner checks plus file size and MIME allowlist checks before attachment metadata is accepted.
- Verified the existing iOS offline shortcut path still builds and tests successfully.

## Verification

- `bun run lint` passed with only existing generated Convex warnings.
- `bun run cli:build` passed.
- `bun run build` passed.
- `bunx convex codegen` passed.
- `xcodebuild test -project ios/IBX/IBX.xcodeproj -scheme IBX -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` passed.
- Browser smoke used a temporary local editor route and confirmed the editor rendered with no missing-image error. The temporary route was removed before commit so it is not public.

## Known Remaining Work

- Tiptap Simple Editor integration for Bri is planned but not implemented in this pass.
- Full Tiptap JSON persistence, editor/page sync, conflict recovery UI, and visible attachment UI are planned but not implemented in this pass.
- Browser-based Clerk auth for the CLI is planned; existing API-key auth remains unchanged.
- Bri publication from IBX is planned but not implemented in this pass.
