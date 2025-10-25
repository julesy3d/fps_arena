# Use a modern, light-weight Node.js image
FROM node:20-alpine AS base

# Set up the application directory
WORKDIR /app

# --- Build Stage ---
FROM base AS builder
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --production

# --- Final Stage ---
FROM base AS final
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY server/ .

# Expose the port Fly.io will set
EXPOSE 8080

# Run the app from its correct directory
CMD ["node", "index.js"]