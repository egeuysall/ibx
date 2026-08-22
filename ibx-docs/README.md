# IBX documentation

This directory contains the **Holocron documentation site** for IBX. It documents the offline-first web app, CLI, API keys, HTTP API, architecture, and development workflow.

## Local development

From the IBX repository root, run **bun run docs:dev** and open the Vite URL it prints. The docs content lives in **src/** and navigation lives in **docs.jsonc**.

## Production build

Run **bun run docs:build** from the repository root, or run **bun run build** inside this directory. The build validates MDX, navigation, OpenAPI processing, and the standalone production bundle.

## Source of truth

The **API Reference tab** is generated from **src/api.yaml**. The older Markdown files under the repository docs/ directory remain useful as raw references, but new API behavior should be reflected in the OpenAPI file and the linked MDX guide.

## Hosting

The **docs bundle** is self-hostable with the generated server entry under dist/rsc/index.js. A production domain and deployment target are intentionally not configured in this scaffold; choose the host before adding a release workflow or public URL.
