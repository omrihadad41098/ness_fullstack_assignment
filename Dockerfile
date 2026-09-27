# One image serving the API and the built client from the same origin (no CORS, one URL to deploy).
# Node 22: Mongoose 9 requires >=20.19 and the build tooling requires >=22.12.

FROM node:22-slim AS client-build
WORKDIR /app/client
# Copy manifests first so `npm ci` is only re-run when dependencies actually change.
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build


FROM node:22-slim AS server-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
# Prune after compiling: tsc and its types are dev dependencies.
RUN npm run build && npm prune --omit=dev


FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    CLIENT_DIST_DIR=/app/client/dist
WORKDIR /app

COPY --from=server-build --chown=node:node /app/server/package.json ./server/package.json
COPY --from=server-build --chown=node:node /app/server/node_modules ./server/node_modules
COPY --from=server-build --chown=node:node /app/server/dist ./server/dist
COPY --from=client-build --chown=node:node /app/client/dist ./client/dist

USER node
EXPOSE 3000

# Reports unhealthy while MongoDB is unreachable, which is the failure worth catching in a deploy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => r.json()).then(b => process.exit(b.db === 'up' ? 0 : 1)).catch(() => process.exit(1))"

# Exec form so node is PID 1 and receives SIGTERM directly (graceful shutdown in index.ts).
CMD ["node", "server/dist/index.js"]
