# ibx CLI

`ibx` is a TypeScript CLI for ibx with browser Clerk login, API-key fallback
(`iak_...`), and Bearer requests.

## install (no npm publish needed)

```bash
curl -fsSL https://ibx.egeuysal.com/install.sh | bash
```

## quick start

```bash
ibx login
ibx add "finish landing page and email two leads" --auto-schedule
ibx todos add "email Pat"
ibx todos list --view today
ibx page create "write launch notes"
ibx publish <todoId>
ibx td
```

## commands

- `ibx login [--url https://ibx.egeuysal.com]`
- `ibx login --api-key iak_... [--url https://ibx.egeuysal.com]`
- `ibx auth login [--api-key iak_...] [--url https://ibx.egeuysal.com]`
- `ibx a l [--api-key iak_...] [--url https://ibx.egeuysal.com]` (short)
- `ibx auth status` / `ibx auth whoami`
- `ibx whoami`
- `ibx a s` (short)
- `ibx auth logout`
- `ibx logout`
- `ibx a o` (short)
- `ibx self-update` (download the latest `ibx` release asset from GitHub Releases)
- `ibx add [--input "..."] [--auto-schedule|--no-auto-schedule] [--include-links|--no-include-links] [--require-descriptions|--no-require-descriptions] [--availability-notes "..."]`
- `ibx n [--input "..."]` (short)
- `ibx sync [--since <unix-ms>] [--json]`
- `ibx page create "title" [same flags as todos add]`
- `ibx publish [publish] <todoId|prefix> [--title "..."] [--private] [--json]`
- `ibx publish unpublish <todoId|prefix> [--json]`
- `ibx attach <file> [--directory /path] [--public] [--json]` (Files library)
- `ibx attach <todoId|prefix> <file> [--public] [--json]` (todo attachment)
- `ibx attach list <todoId|prefix> [--json]`
- `ibx attach list --all [--json]`
- `ibx files tree [--json]`
- `ibx files list [--directory /path] [--json]`
- `ibx files upload <path> [--folder <folderId>] [--public] [--json]`
- `ibx files mkdir <name|/path> [--parent <folderId>] [--json]`
- `ibx files rename <itemId> "<new name>" [--json]` (file or folder)
- `ibx mkdir /path` (short form)
- `ibx files move <fileId> <folderId|root>`
- `ibx files public|private|delete <fileId>`
- `ibx todos list [--view today|upcoming|archive|all] [--json]`
- `ibx t l [--view today|upcoming|archive|all] [--json]` (short)

Default login opens a browser for Clerk approval and stores the generated CLI
API key in secure OS storage when available: macOS Keychain, Windows Credential
Manager, or Linux Secret Service. If no OS credential store is available, ibx
falls back to the local config file with `0600` permissions and prints a
warning. Use `--api-key` for automation or pre-generated keys.

Todo attachment uploads accept nonempty files up to 30 MiB (31,457,280 bytes); Files library uploads accept up to 500 MiB. Supported types include PDF,
GIF/JPEG/PNG/SVG/WebP, Markdown/plain text, MP3/M4A/WAV/OGG audio, and
MP4/M4V/MOV/WebM/OGV video. `ibx attach <todoId> <file>` reads a local path;
`ibx attach list <todoId>` lists that todo's files, and `ibx attach list --all`
lists across your owner account (at most 100 records before deleted entries are
filtered). Duplicate names receive suffixes such as `demo-2.mp3`.
New uploads are private by default; the returned owner URL requires authentication.
Use `ibx attach <todoId> <file> --public` or `ibx attach <file> --public` to explicitly allow anyone with the public
link to download without signing in. Use `--directory /content/YYYY/MM/DD` to create the directory path and store a library upload there. The command publishes after uploading and
prints the resolved public URL. JSON output includes `visibility` and `publicUrl`
when the server returns them. Notes and file management remain owner-scoped.
Uploads use signed R2 PUT URLs without sending your IBX API key to storage.
Older servers without signed-upload support still use the legacy Convex upload
flow and retain their server-defined visibility; `--public` requires the new API.
If publishing fails after upload, the error includes the uploaded file ID; do not
re-upload just to retry publishing.

The in-app terminal uses `attach [number|id]` to open a file chooser; omit the todo
to upload into Files, or use `attach --directory /path` to upload there. Add the
directory flag after a todo ID to place that todo attachment in Files folders.
`mkdir /path` creates nested directories and `tree` shows the Files library.
`attach list <number|id>` lists a todo's attachments.

- `ibx todos add "title" [--notes "..."] [--due YYYY-MM-DD] [--hours 1.5|90m|1h] [--start HH:mm|HH:mm am/pm] [--priority 1|2|3, defaults to 1] [--recurrence none|daily|weekly|monthly] [--json]`
- `ibx t a "title" [same flags]` (short)
- `ibx td` (today's completed tasks in `America/Chicago`, override with `IBX_TIMEZONE`)
- `ibx todos done --id <todoId|prefix>`
- `ibx t x --id <todoId|prefix>` (short)
- `ibx todos open --id <todoId|prefix>`
- `ibx t o --id <todoId|prefix>` (short)
- `ibx todos delete --id <todoId|prefix>`
- `ibx t d --id <todoId|prefix>` (short)
- `ibx todos set --id <todoId|prefix> [--title "new title"] [--notes "..."] [--notes-null] [--due YYYY-MM-DD] [--hours 1.5|90m|1h] [--start HH:mm|HH:mm am/pm|clear] [--priority 1|2|3] [--recurrence none|daily|weekly|monthly]`
- `ibx t s --id <todoId|prefix> [same flags]` (short)
- `ibx calendar status`
- `ibx cal s` (short)
- `ibx calendar rotate` (rotate + print new ICS feed URL)
- `ibx cal r` (short)

## reliability + exits

- network timeout + bounded retries are enabled for API calls.
- structured logs are emitted to stderr (`timestamp level action=...`).
- CLI checks once per day for updates via `GET /ibx-version.json` and prints an install command when newer.
- `ibx self-update` updates the current executable from `https://github.com/egeuysall/inbox/releases/latest`.
- set `IBX_DISABLE_UPDATE_CHECK=1` to disable update checks.
- stable exit codes:
  - `2` validation/input error
  - `3` auth error
  - `4` network/timeout
  - `5` server error
  - `6` not found
  - `7` conflict/ambiguous target
  - `8` rate limit

## local build

```bash
bun run cli:build
bun run cli:bundle
```
