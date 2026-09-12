# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Esper – multi-stage production build
#   deps     : install all dependencies
#   builder  : prisma generate + next build (standalone output)
#   migrate  : one-shot container that runs migrations + seed, then exits
#   runner   : lean image that serves the app
# ---------------------------------------------------------------------------
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Default timezone for "today" / "this month" (override with TZ in .env / compose).
ENV TZ=Asia/Kolkata

# ---- deps ------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- builder ---------------------------------------------------------------
FROM base AS builder
ARG NEXT_PUBLIC_APP_NAME="Esper"
ARG NEXT_PUBLIC_THEME_COLOR="#0f766e"
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_THEME_COLOR=$NEXT_PUBLIC_THEME_COLOR
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npx next build

# ---- migrate ---------------------------------------------------------------
# Same filesystem as the builder (has the prisma CLI, tsx and the seed script).
FROM builder AS migrate
ENV NODE_ENV=production
CMD ["sh", "./scripts/migrate-and-seed.sh"]

# ---- runner ----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
