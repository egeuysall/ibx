# IBX Implementation Summary

## Completed in This Pass

- Fixed the production redirect loop earlier by making the landing page depend on Clerk auth only.
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
- Verified the existing iOS offline shortcut path still builds and tests successfully.

## Verification

- `bun run lint` passed with only existing generated Convex warnings.
- `bun run cli:build` passed.
- `bun run build` passed.
- `bunx convex codegen` passed.
- `xcodebuild test -project ios/IBX/IBX.xcodeproj -scheme IBX -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` passed.

## Known Remaining Work

- Tiptap Simple Editor integration for IBX and Bri is planned but not implemented in this pass.
- Full editor/page sync, conflict recovery UI, and attachment storage endpoints are planned but not implemented in this pass.
- Browser-based Clerk auth for the CLI is planned; existing API-key auth remains unchanged.
- Bri publication from IBX is planned but not implemented in this pass.
