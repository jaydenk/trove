FROM oven/bun:1
WORKDIR /app

# Install deps (root)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Install deps (frontend)
COPY frontend/package.json frontend/bun.lock frontend/
RUN cd frontend && bun install --frozen-lockfile

# Copy all source
COPY . .

# Build frontend
RUN cd frontend && bun run build

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Create data directory
RUN mkdir -p /app/data

EXPOSE 3737
CMD ["bun", "src/server.ts"]
