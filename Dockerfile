# Folio — production image for Railway.
#
# SECURITY: This Dockerfile deliberately declares NO ARG or ENV for any secret
# (AI_API_KEY, SEARCH_API_KEY, DATABASE_URL, ...). Secrets are read from
# process.env only at server runtime, where Railway injects service variables.
# Nothing secret is ever baked into an image layer.
#
# RUNTIME-ONLY DATABASE: the build never opens SQLite. The app initializes the
# database lazily at runtime, and the persistent Railway volume (/app/data,
# RAILWAY_VOLUME_MOUNT_PATH) is mounted only when the container starts. The
# start command bootstraps runtime data directories and the local corpus
# before launching the server.

# ---------- build stage ----------
FROM node:22-slim AS build
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Install dependencies first for better layer caching. postinstall only
# creates data directories and the corpus inside the image (never the DB).
COPY package.json package-lock.json ./
RUN npm ci

# Compile the application. No secrets and no database are needed here.
COPY . .
RUN npm run build

# ---------- runtime stage ----------
FROM node:22-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-secret, non-build values only. Secrets come from Railway at runtime.
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.js ./next.config.js
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/data ./data

EXPOSE 3000

# Runtime-only initialization (volume dirs + corpus seed), then the server.
# Secrets are read from process.env at runtime only.
CMD ["sh", "-c", "node scripts/ensure-runtime-data.mjs && npm start"]
