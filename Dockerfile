# Multi-stage build for production

# Stage 1: Build frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2: Backend
FROM node:18-alpine AS backend
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --only=production
COPY server/ ./

# Stage 3: Production
FROM node:18-alpine
WORKDIR /app

# Copy backend
COPY --from=backend /app/server ./server

# Copy built frontend
COPY --from=frontend-builder /app/client/dist ./server/public

# Create data directory for persistent storage
RUN mkdir -p /app/server/data

WORKDIR /app/server

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["node", "src/index.js"]
