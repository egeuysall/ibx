# IBX Offline, Auth, Editor, and Bri Integration Plan

## Current Architecture Summary

- IBX is a Bun/Next.js 16 app with Clerk for browser auth, Convex for persistent backend state, a service worker for production shell caching, and a browser API client that uses Clerk cookies.
- Convex currently stores `thoughts`, `todos`, `apiKeys`, `sessions`, and `memories`. API keys remain the integration path for the CLI and external callers.
- Browser offline state is currently a manual IndexedDB wrapper in `src/lib/indexedDb.ts` with local thoughts, queued prompts, and one cached todo snapshot. Todo mutations are not fully offline-first yet.
- The iOS app already has local JSON-backed task storage, an offline pending-operation queue, and an App Intent shortcut for adding todos offline.
- Bri is a separate Bun/Next.js 16 + Convex + Clerk app. Its `notes` table already supports owner-scoped public/private notes, markdown content, deletion state, expiry, API keys, and public `/{username}/{slug}` pages.
- Rich text editing does not exist in either app yet. IBX uses textareas for thoughts and todo notes; Bri renders markdown with `react-markdown`.

## Files to Modify

IBX web:
- `package.json`, `bun.lock`: add Dexie and Tiptap dependencies.
- `src/lib/indexedDb.ts`: replace the hand-rolled IndexedDB implementation with a Dexie-backed compatibility layer.
- `src/lib/offline/*`: add structured offline tables for entities, pending operations, attachments, sync metadata, and queue helpers.
- `src/lib/types.ts`: add rich content, sync, attachment, and publication types while preserving existing API key and todo contracts.
- `src/hooks/useThoughts.ts`: move thought and todo writes to local-first mutations with queued sync.
- `src/components/layout/app-shell.tsx`, `src/components/thoughts/thought-composer.tsx`, `src/components/todos/todos-panel.tsx`: wire local-first state, rich editors, attachments, and Bri publish controls.
- `src/app/api/**`: add bounded sync endpoints, upload/publish endpoints, and keep current cookie/API-key routes compatible.
- `public/sw.js`, `src/components/layout/sw-register.tsx`: keep production shell caching, add safe offline fallback behavior without caching API responses.
- `src/proxy.ts`, `src/app/page.tsx`: keep Clerk redirect behavior finite and preserve signed-in app routing.

IBX Convex:
- `convex/schema.ts`: widen `thoughts` and `todos` with sync metadata and add attachment/publication/reminder tables.
- `convex/thoughts.ts`, `convex/todos.ts`: add bounded delta sync and idempotent apply functions.
- `convex/attachments.ts`: generate upload URLs, attach storage IDs, and return signed URLs only to authorized owners.
- `convex/reminders.ts`, `convex/crons.ts` if needed: use scheduled jobs or bounded cron only where it reduces client polling.
- `convex/apiKeys.ts`: preserve current API key behavior and validators.

IBX CLI:
- `cli/src/core/config.ts`, `cli/src/core/http.ts`, `cli/src/commands/auth.ts`: add browser-based Clerk login without breaking `ibx auth login --api-key iak_...`.
- `cli/README.md`: document both browser auth and API-key auth.

IBX iOS:
- `ios/IBX/IBX/TaskStore.swift`, `OfflineTaskStorage.swift`, `IBXClient.swift`, `IBXAppIntents.swift`, `ContentView.swift`, `Views.swift`: finish offline-first add/edit/delete/toggle/run behavior, keep shortcut capture offline, and improve contrast.
- `ios/IBX/IBXTests/*`: cover offline queue persistence and shortcut capture.

Bri:
- `/Users/egeuysal/Developer/bri/package.json`, `bun.lock`: add Tiptap dependencies if editing happens inside Bri.
- `/Users/egeuysal/Developer/bri/src/**`: add or adapt an editor while continuing to publish sanitized markdown through existing note APIs.
- `/Users/egeuysal/Developer/bri/convex/notes.ts`: reuse existing public/private note model unless IBX needs additional source metadata.

## Data Model Changes Needed

- Add per-record sync metadata: `updatedAt`, `version`, optional `deletedAt`, and stable client-generated external IDs where missing.
- Add attachment metadata in Convex with `ownerKey`, local ID, Convex storage ID, content type, size, status, timestamps, and indexes by owner and parent entity.
- Add publication metadata in IBX for Bri links: owner, source entity, Bri note URL/slug, visibility, last published time, and status.
- Avoid unbounded arrays in Convex documents. Store attachments, reminders, and publications in separate tables.
- Keep API keys keyed by existing `iak_` values and server-side hashes. Do not expose `CLERK_SECRET_KEY` or any bridge API key to client code.
- Reminder email delivery should derive recipients server-side from Clerk identity data and use only server/Convex env vars such as `RESEND_API_KEY`, `NOTIFICATION_EMAIL_FROM`, and `CLERK_SECRET_KEY`.

## Offline Sync Strategy

- Use Dexie as the browser offline source of truth for thoughts, todos, editor documents, attachments metadata, and pending operations.
- Keep `src/lib/indexedDb.ts` as a compatibility facade while moving storage internals to Dexie so existing callers keep working during migration.
- Every local write creates or updates the local entity immediately and appends an idempotent pending operation with a client operation ID.
- Sync runs on app load, network regain, window focus, and explicit user action. Avoid tight polling; use backoff after failures.
- Server sync endpoints accept bounded operation batches, validate ownership from Clerk/session/API key server-side, and return acknowledged operations plus changed records since the last cursor.
- Conflicts use last-writer-wins for simple scalar fields in the first pass, with version checks to prevent accidental stale overwrites on shared data.
- Service worker caches only shell/assets/navigation fallbacks. API responses remain network/Dexie-mediated to avoid stale auth leakage.

## Bri Integration Strategy

- Publish from IBX to Bri through Bri's existing `/api/notes` API using a server-held bridge credential or the user's Clerk token path where available.
- Store the returned Bri note ID/slug/URL in IBX publication metadata.
- Export rich editor content to markdown before calling Bri. Bri already safely renders markdown via `MarkdownContent`, so avoid introducing raw HTML public rendering.
- Preserve Bri private/public visibility and expiry controls instead of duplicating publishing semantics in IBX.
- If publishing from offline mode, queue the publication operation and show local pending state until sync completes.

## Tiptap Integration Strategy

- Use Tiptap's Simple Editor pattern as client-only React components with `immediatelyRender: false` for Next.js SSR safety.
- Store both structured editor JSON and markdown/plain-text projections where needed. IBX task extraction can continue using plain text.
- Replace textarea entry points incrementally: thoughts first, todo notes second, Bri note editor third.
- Sanitize or avoid HTML output. Public Bri pages should receive markdown, not unsanitized Tiptap HTML.
- Keep the visual treatment dense and utility-first so the editor feels like IBX/Bri, not a marketing surface.

## CLI Auth Strategy

- Preserve the existing API-key path: `ibx auth login --api-key iak_...` and `IBX_API_KEY` continue to work unchanged.
- Add browser auth as the default login path using a short-lived local callback or device-style flow that opens Clerk in the browser.
- Store Clerk-derived CLI credentials separately from API keys with restrictive file permissions, and prefer OS keychain storage if added.
- Build request headers from the stored credential type: `Authorization: Bearer iak_...` for API keys, or a Clerk-compatible bearer/session token for browser auth.
- `ibx auth status` should clearly report `apiKey` vs `clerk` without printing secrets.

## iOS Design Strategy

- Keep iOS local-first. All add/edit/toggle/delete/run operations should update the local snapshot immediately and enqueue sync if offline or unauthorized.
- The App Intent shortcut accepts a text input title, creates a local pending todo, and returns success without requiring network.
- When online and signed in, `TaskStore` flushes pending operations to the web API and reconciles IDs/statuses.
- Settings should expose sync state, pending operation count, notification controls, theme, and account status without requiring a connection URL field.
- Improve toast contrast using dark-background/high-contrast foreground colors in dark mode and verified readable colors in light mode.

## Convex Cost-Control Strategy

- Prefer push/pull sync with explicit user/session triggers over global polling.
- Use indexes for every owner-scoped read and delta query. Keep batch sizes bounded.
- Use `ctx.scheduler.runAt` for specific reminders or purges instead of frequent broad cron scans.
- If a cron is needed, use `crons.interval` or `crons.cron`, and process small indexed batches.
- Store high-churn sync queue state separately from stable task/thought documents.
- Keep attachment metadata separate from storage blobs and request signed URLs only when needed.

## Verification Plan

- Web: `bun run lint`, `bun run build`, browser smoke for signed-out landing redirect and signed-in app access.
- Convex: run `bun convex dev` during local validation, then `bunx convex codegen` or equivalent generated API check if schema changes.
- CLI: `bun run cli:build`, API-key auth smoke, and browser-auth status smoke once implemented.
- iOS: use XcodeBuildMCP or `xcodebuild` to build and test the `IBX` scheme on the configured simulator; verify shortcut App Intent path via unit coverage or simulator logs.
- Bri: run Bri lint/build after editor or publishing changes.
