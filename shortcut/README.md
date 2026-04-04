# ibx Apple Shortcut

This directory generates an Apple Shortcut that captures one text input and opens:

- `https://ibx.egeuysal.com/?shortcut=<encoded-text>&source=shortcut`

The web app ingests this text, saves it to IndexedDB immediately, and sends it to AI when online.

## Build shortcut file

```bash
pnpm --dir shortcut build
```

Output files:

- `shortcut/dist/ibx-capture.shortcut`
- `public/shortcuts/ibx-capture-unsigned.shortcut`

## Install on iPhone

1. Open this URL on iPhone Safari:
   - `https://ibx.egeuysal.com/shortcuts/ibx-capture.shortcut`
   - This redirects to `SIGNED_SHORTCUT_URL` when configured (`https://www.icloud.com/shortcuts/...`).
   - If no signed URL is configured, it falls back to the unsigned hosted file.
2. Import into the Shortcuts app.
3. Run `ibx capture`, type your thought, submit.

If your PWA is already installed, iOS will open the same app URL and the app will queue offline automatically.
