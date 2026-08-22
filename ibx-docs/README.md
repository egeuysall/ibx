# IBX documentation

This directory contains the **Holocron documentation site** for IBX. It documents the offline-first web app, CLI, API keys, HTTP API, architecture, and development workflow.

## Local development

From the IBX repository root, run **bun run docs:dev** and open the Vite URL it prints. The docs content lives in **src/** and navigation lives in **docs.jsonc**.

## Production build

Run **bun run docs:build** from the repository root, or run **bun run build** inside this directory. The build validates MDX, navigation, OpenAPI processing, and the standalone production bundle.

## Source of truth

The **API Reference tab** is generated from **src/api.yaml**. The older Markdown files under the repository docs/ directory remain useful as raw references, but new API behavior should be reflected in the OpenAPI file and the linked MDX guide.

## Hosting

The **public docs URL** is [ibx.egeuysal.com/docs](https://ibx.egeuysal.com/docs). The IBX Next app rewrites that path to the production `ibx-docs` Vercel project. Deploy the docs bundle with **bun run docs:deploy** from the repository root; set `IBX_DOCS_URL` only when using a different deployment target.
