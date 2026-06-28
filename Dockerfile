# BookStack MCP Server — runtime image
# Built from the repo's source. Pushed to ghcr.io/ttpears/bookstack-mcp.

FROM node:20-alpine AS builder
WORKDIR /app

# --ignore-scripts: the package's `prepare` hook runs the build, but src/ isn't
# present yet at install time — build explicitly once sources are copied.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

RUN npm prune --omit=dev --ignore-scripts

FROM node:20-alpine AS runtime
RUN apk add --no-cache dumb-init wget
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

RUN addgroup -g 1001 -S mcpuser && adduser -S mcpuser -u 1001
USER mcpuser

# HTTP transport by default; bind all interfaces so traefik / the LibreChat
# Docker network can reach it (the server defaults to 127.0.0.1 for stdio safety).
ENV NODE_ENV=production \
    MCP_TRANSPORT=http \
    MCP_HTTP_HOST=0.0.0.0 \
    MCP_HTTP_PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
