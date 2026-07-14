# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89
# Build stage
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS builder

WORKDIR /app

# Step 1: install deps FIRST so npm ci layer is cached when package*.json
# is unchanged. ARGs that change every deploy (e.g. NEXT_PUBLIC_GIT_SHA)
# would invalidate everything below them — declare them AFTER npm ci.
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm ci

# Step 2: build-time ARGs (consumed by `next build` below). Putting them
# here means deploy-time changes (new commit SHA) only invalidate the
# `next build` layer, not the much heavier `npm ci` layer above.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SENTRY_DSN
ARG GIT_SHA
ARG BUILT_AT
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_GIT_SHA=$GIT_SHA
ENV GIT_SHA=$GIT_SHA
ENV BUILT_AT=$BUILT_AT

# A production image is invalid unless it can identify the exact source and
# build timestamp. This also prevents an accidental `unknown` release.
RUN node -e "const { GIT_SHA, BUILT_AT } = process.env; const parsed = new Date(BUILT_AT); if (!/^[0-9a-f]{40}$/.test(GIT_SHA ?? '') || !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$/.test(BUILT_AT ?? '') || Number.isNaN(parsed.getTime()) || parsed.toISOString() !== BUILT_AT.replace(/Z$/, '.000Z')) process.exit(1)"

COPY . .
# Sentry's upload token is optional and is exposed only to this build process.
# It is never stored in an ARG, ENV layer, image history, or runtime image.
RUN --mount=type=cache,target=/app/.next/cache \
    --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN \
    npm run build

# Production stage (Next.js standalone)
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS runner

WORKDIR /app

ARG GIT_SHA
ARG BUILT_AT
ENV GIT_SHA=$GIT_SHA
ENV BUILT_AT=$BUILT_AT

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Runtime needs only `node`. Remove package managers (and their dependency
# trees) from the attack surface, and pick up security fixes for TLS libraries.
RUN apk upgrade --no-cache libcrypto3 libssl3 \
    && rm -rf /usr/local/lib/node_modules/npm /opt/yarn-v* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER nextjs

EXPOSE 10000

ENV PORT=10000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT:-10000}/api/livez" || exit 1

CMD ["node", "server.js"]
