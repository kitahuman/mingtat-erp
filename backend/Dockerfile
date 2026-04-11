# ============================================
# Stage 1: Install dependencies
# ============================================
FROM node:22-alpine AS deps

WORKDIR /app

# Copy package files
COPY package.json package-lock.json pnpm-workspace.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm@10 && \
    pnpm install --frozen-lockfile

# ============================================
# Stage 2: Build application
# ============================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (no DB needed at build time)
RUN npx prisma generate

# Build NestJS
RUN npm run build

# ============================================
# Stage 3: Production runtime
# ============================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install pnpm for production install
RUN npm install -g pnpm@10

# Copy package files
COPY package.json package-lock.json pnpm-workspace.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy Prisma schema and migrations (needed for migrate deploy)
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts

# Re-generate Prisma client in production node_modules
RUN npx prisma generate

# Copy built application
COPY --from=builder /app/dist ./dist

# Copy startup scripts
COPY scripts ./scripts

# Create uploads directory
RUN mkdir -p /app/uploads

EXPOSE 3001

# Entrypoint: run migrations then start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
