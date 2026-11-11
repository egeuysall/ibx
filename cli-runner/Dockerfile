FROM node:22-slim
WORKDIR /app
COPY server.mjs shell.mjs ibx.mjs ./
RUN useradd -m -u 10001 runner && mkdir -p /tmp/ibx-cli-demo-workspaces && chown -R runner /tmp/ibx-cli-demo-workspaces
USER runner
EXPOSE 8080
CMD ["node", "server.mjs"]
