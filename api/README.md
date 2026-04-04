# ibx API (Bearer Key)

Use your API key (`iak_...`) as a Bearer token:

```bash
Authorization: Bearer iak_xxx...
```

Base URL (production):

```text
https://ibx.egeuysal.com
```

## Quick Start

```bash
export IBX_BASE_URL="https://ibx.egeuysal.com"
export IBX_API_KEY="iak_xxx..."
```

Check auth:

```bash
curl -sS "$IBX_BASE_URL/api/session" \
  -H "Authorization: Bearer $IBX_API_KEY"
```

## Bearer-Key Endpoints

### `POST /api/todos/generate`
Generate todos from free text.

Body:

```json
{
  "text": "finish landing page and follow up with Acme this weekend",
  "today": "2026-04-03"
}
```

- `text` required.
- `today` optional (`YYYY-MM-DD`), used as reference date.

Example:

```bash
curl -sS -X POST "$IBX_BASE_URL/api/todos/generate" \
  -H "Authorization: Bearer $IBX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"finish landing page and follow up with Acme this weekend"}'
```

### `GET /api/todos`
List all todos.

Query:
- `today` optional (`YYYY-MM-DD`) for scheduling normalization.

```bash
curl -sS "$IBX_BASE_URL/api/todos?today=2026-04-03" \
  -H "Authorization: Bearer $IBX_API_KEY"
```

### `PATCH /api/todos/:todoId`
Update status and/or schedule fields.

Body fields:
- `status`: `"open"` or `"done"`
- `dueDate`: `YYYY-MM-DD` or `null`
- `recurrence`: `"none" | "daily" | "weekly" | "monthly"`
- `priority`: `1 | 2 | 3`

```bash
curl -sS -X PATCH "$IBX_BASE_URL/api/todos/<todoId>" \
  -H "Authorization: Bearer $IBX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"done"}'
```

### `DELETE /api/todos/:todoId`
Delete a todo.

```bash
curl -sS -X DELETE "$IBX_BASE_URL/api/todos/<todoId>" \
  -H "Authorization: Bearer $IBX_API_KEY"
```

### `GET /api/thoughts`
List thought runs.

```bash
curl -sS "$IBX_BASE_URL/api/thoughts" \
  -H "Authorization: Bearer $IBX_API_KEY"
```

### `POST /api/thoughts/sync`
Upsert thought records from a client queue.

```bash
curl -sS -X POST "$IBX_BASE_URL/api/thoughts/sync" \
  -H "Authorization: Bearer $IBX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"thoughts":[{"externalId":"<uuid>","rawText":"draft follow-up","createdAt":1712443200000,"status":"pending","aiRunId":null}]}'
```

### `GET /api/thoughts/:externalId/todos`
List todos for a specific thought.

```bash
curl -sS "$IBX_BASE_URL/api/thoughts/<externalId>/todos?today=2026-04-03" \
  -H "Authorization: Bearer $IBX_API_KEY"
```

### `POST /api/thoughts/:externalId/generate`
Run AI generation for an existing thought.

```bash
curl -sS -X POST "$IBX_BASE_URL/api/thoughts/<externalId>/generate" \
  -H "Authorization: Bearer $IBX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"today":"2026-04-03"}'
```

## Notes

- Session-only endpoints (`/api/login`, `/api/logout`, `/api/api-keys*`) are for browser cookie auth, not for bearer-key integrations.
- Keep API keys server-side or in trusted environments.
