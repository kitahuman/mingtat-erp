# ============================================
# Stage 1: Install dependencies
# ============================================
FROM node:22-alpine AS deps

WORKDIR /app

# Copy package files (use npm with package-lock.json)
COPY package.json package-lock.json ./

# Install all dependencies (including dev for build)
RUN npm ci

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

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy Prisma schema and migrations (needed for migrate deploy)
COPY prisma ./prisma

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
