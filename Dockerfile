# ----------------------------------------------------
# Stage 1: Build stage
# ----------------------------------------------------
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install system dependencies required for native modules and Prisma
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Disable Husky in CI/Docker environments
ENV CI=true
ENV HUSKY=0

# Copy dependency manifests and config
COPY package*.json ./
COPY .npmrc ./
COPY scripts/ ./scripts/

# Install dependencies
RUN npm ci

# Copy Prisma schema and configuration
COPY prisma ./prisma
COPY prisma7.config.ts ./

# Generate Prisma Client
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npm run prisma:generate

# Copy TypeScript config and source code
COPY tsconfig.json ./
COPY src/ ./src

# Compile TypeScript
RUN npm run build

# Prune devDependencies to keep production image light
RUN npm prune --omit=dev

# ----------------------------------------------------
# Stage 2: Production runner
# ----------------------------------------------------
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Install OpenSSL for Prisma and curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=5000
ENV HOST=0.0.0.0

# Copy built application and production dependencies
COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/prisma7.config.ts ./prisma7.config.ts

USER node

EXPOSE 5000

# Container health probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:5000/ping || exit 1

CMD ["node", "dist/server.js"]
