# syntax=docker/dockerfile:1
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
ARG NEXT_PUBLIC_GIT_SHA
ARG SENTRY_AUTH_TOKEN
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_GIT_SHA=$NEXT_PUBLIC_GIT_SHA
# Coolify builds on a 4 GB ARM host. The full production build (including
# Sentry source maps) can exceed Node's default old-space limit, so reserve
# up to 3 GB for the builder while leaving headroom for BuildKit and Coolify.
ENV NODE_OPTIONS="--max-old-space-size=3072"
# SENTRY_AUTH_TOKEN is consumed by withSentryConfig at build time only.
# Not exported as ENV so it never leaks into the runtime image.
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN

COPY . .
RUN --mount=type=cache,target=/app/.next/cache npm run build

# Production stage (Next.js standalone)
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS runner

WORKDIR /app

ARG GIT_SHA=unknown
ARG BUILT_AT=unknown
ENV GIT_SHA=$GIT_SHA
ENV BUILT_AT=$BUILT_AT

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER nextjs

EXPOSE 10000

ENV PORT=10000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT:-10000}/api/health" || exit 1

CMD ["node", "server.js"]
