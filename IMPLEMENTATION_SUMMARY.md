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
- Added dedicated per-todo note pages:
  - every todo can open at `/app/todos/[todo-slug]`,
  - the todo page is the single rich note and attachment surface,
  - the main list no longer mounts an inline Tiptap/attachment editor panel,
  - note saves update the todo `notes` field for compatibility,
  - note saves also persist bounded Tiptap JSON and HTML fields for rich editor/publishing compatibility,
  - offline or DNS-failed saves remain visible locally and enqueue a todo sync operation,
  - local offline create ops now tolerate later note payloads during sync.
- Added first visible todo attachment controls:
  - todo pages can attach files,
  - online files upload through Convex storage,
  - offline files are stored as local Dexie metadata/blob rows and queued as pending uploads,
  - queued attachment uploads replay after reconnect, including attachments added to local-only todos before their server ID exists.
- Fixed attachment listing for production:
  - added the exact `attachments.by_parentKind_and_parentId` Convex index,
  - attachment reads still validate ownership server-side before returning files,
  - deployed the Convex schema/function change to production.
- Added the first IBX to Bri publishing slice:
  - added owner-scoped `publications` metadata in Convex,
  - added `/api/publications/bri` to publish, update, read status, and unpublish Bri pages through Bri's existing API,
  - converts Tiptap JSON to Markdown before sending to Bri so public pages keep using Bri's markdown renderer,
  - added publish/update/open/copy/unpublish controls to each todo page,
  - documents `BRI_BASE_URL` and server-only `BRI_INTERNAL_API_KEY`.
- Fixed browser DNS/offline failure behavior:
  - network failures emit an app-level offline event,
  - `useOfflineStatus` listens to that event instead of trusting `navigator.onLine` alone,
  - queued AI prompts pause on network failure instead of marking every queued item failed.
- Fixed stale browser shell behavior by stopping the service worker from caching auth-sensitive navigation HTML, which prevents old landing/app pages from causing redirect loops after auth state changes.
- Added browser-based Clerk login for the CLI:
  - `ibx auth login` now opens a browser approval flow by default,
  - the browser flow uses loopback redirect, state, PKCE-style verifier/challenge, and short-lived one-time Convex auth codes,
  - the server mints the same scoped API-key format after approval so existing CLI requests and scripts still work,
  - `--api-key iak_...` remains supported for automation/manual key workflows.
- Verified the existing iOS offline shortcut path still builds and tests successfully.

## Verification

- `bun run lint` passed with only existing generated Convex warnings.
- `bun run cli:build` passed.
- `bun run build` passed.
- `bunx convex codegen` passed.
- `bunx convex deploy --yes` deployed the attachment index to production.
- `bunx convex run --prod attachments:listAttachments '{"ownerKey":"clerk:user_3FSuDOl29us0znM4RCdO66m9gM4","parentKind":"todo","parentId":"jd78dbtg8ykcvan6ns6znsmkvs89379d","limit":50}'` returned `[]` without the previous index error.
- `xcodebuild test -project ios/IBX/IBX.xcodeproj -scheme IBX -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` passed.
- Browser smoke used a temporary local editor route and confirmed the editor rendered with no missing-image error. The temporary route was removed before commit so it is not public.

## Known Remaining Work

- Tiptap Simple Editor integration for Bri is planned but not implemented in this pass.
- Conflict recovery UI for page edits remains planned.
- CLI credentials still store in the existing local config file; platform keychain storage remains planned.
- Bri publication now has a first server-side bridge, but per-user Bri account connection and offline queued publish operations remain planned.
