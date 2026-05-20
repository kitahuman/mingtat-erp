# ============================================
# Stage 1: Install dependencies
# ============================================
FROM node:22-alpine AS deps

ENV PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install system dependencies
RUN apk add --no-cache poppler-utils

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

# Generate Prisma client
RUN npx prisma generate

# Build NestJS
RUN npm run build

# ============================================
# Stage 3: Production runtime
# ============================================
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy package files
COPY package.json package-lock.json ./

# Install system dependencies
RUN apt-get update && apt-get install -y chromium poppler-utils fonts-noto-cjk fontconfig --no-install-recommends && fc-cache -f -v && rm -rf /var/lib/apt/lists/*

# Install production dependencies only
RUN npm ci --omit=dev

# Copy Prisma schema and migrations
COPY prisma ./prisma

# Re-generate Prisma client in production node_modules
RUN npx prisma generate

# Copy built application from builder stage
# NestJS default build output is usually dist/main.js
COPY --from=builder /app/dist ./dist

# Create uploads directory
RUN mkdir -p /app/uploads

EXPOSE 3001

# Entrypoint: run migrations then start using the correct path
# Based on common NestJS structure, it is usually dist/main.js
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
