# Use a modern, light-weight Node.js image
FROM node:20-alpine AS base

# Set up the application directory
WORKDIR /app

# --- Build Stage ---
# This stage builds production dependencies
FROM base AS builder
WORKDIR /app
# Copy only the package files from the server/ directory
COPY server/package.json server/package-lock.json ./
# Install production-only dependencies
RUN npm ci --production

# --- Final Stage ---
# This stage creates the final, lean image
FROM base AS final
WORKDIR /app
# Copy the production dependencies from the builder stage
COPY --from=builder /app/node_modules ./node_modules
# Copy your server's application code
COPY server/ .

# IMPORTANT: Set the working directory to the volume mount point
# This is the key to making your SQLite DB persistent
WORKDIR /data

# Expose the port Fly.io will set
EXPOSE 8080

# Run the app. Note we use the absolute path to the entrypoint
# since we changed the WORKDIR.
CMD ["node", "/app/index.js"]