# Stage 1 — build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2 — install backend production deps
FROM node:20-alpine AS backend-deps
WORKDIR /app/backend
COPY backend/package*.json ./
# --omit=optional drops sqlite3 (a local-dev-only optionalDependency) and its
# node-gyp/cacache/node-tar build chain, which npm audit flags. Prod uses Postgres
# via the regular pg/sequelize deps, so the shipped image never needs sqlite3.
RUN npm ci --omit=dev --omit=optional

# Stage 3 — runtime
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app/backend
COPY backend/ ./
COPY --from=backend-deps /app/backend/node_modules ./node_modules
COPY --from=frontend-build /app/frontend/dist ./public
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1
CMD ["node", "server.js"]
