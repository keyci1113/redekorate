# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
# The production VPS has a slow, flaky uplink: retry registry fetches instead of failing the deploy.
RUN npm config set fetch-retries 6 fetch-retry-mintimeout 20000 fetch-retry-maxtimeout 180000 fetch-timeout 900000 \
 && npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- runtime ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production UPLOAD_DIR=/app/uploads
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm config set fetch-retries 6 fetch-retry-mintimeout 20000 fetch-retry-maxtimeout 180000 fetch-timeout 900000 \
 && npm ci --omit=dev -w server --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/migrations server/migrations
COPY --from=build /app/web/dist web/dist
# Se ejecuta sin privilegios de root
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:4000/api/health || exit 1
CMD ["node", "server/dist/index.js"]
