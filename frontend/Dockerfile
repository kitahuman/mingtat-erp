# ============================================
# Stage 1: Install dependencies
# ============================================
FROM node:22-alpine AS deps

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (--legacy-peer-deps for react-leaflet peer conflict)
RUN npm ci --legacy-peer-deps

# ============================================
# Stage 2: Build application
# ============================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env: BACKEND_URL for next.config.js rewrites
# In Docker, frontend SSR calls backend via container network
ARG BACKEND_URL=http://backend:3001
ENV BACKEND_URL=${BACKEND_URL}

# Build Next.js (standalone output)
RUN npm run build

# ============================================
# Stage 3: Production runtime
# ============================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy standalone server
COPY --from=builder /app/.next/standalone ./
# Copy static assets
COPY --from=builder /app/.next/static ./.next/static
# Copy public assets
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
