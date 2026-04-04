# ibx Apple Shortcut

This directory generates an Apple Shortcut that captures text and:

- posts directly to `POST https://ibx.egeuysal.com/api/todos/generate` with `Authorization: Bearer iak_...`

## Build shortcut file

```bash
pnpm --dir shortcut build
```

Output files:

- `shortcut/dist/ibx-capture.shortcut`
- `public/shortcuts/ibx-capture.shortcut` (signed with `shortcuts sign --mode anyone`)

## Install on iPhone

1. Open this URL on iPhone Safari:
   - `https://ibx.egeuysal.com/shortcuts/ibx-capture.shortcut`
2. Import into the Shortcuts app.
3. Run `ibx-capture`, paste your text, submit.

The shortcut contains a text action named `API Key (Edit Once)` with `iak_replace_me`.
Edit that action one time after install and set your real `iak_...` key.
After that, it sends directly to API without asking every run.
