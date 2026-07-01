FROM oven/bun:1 AS base
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile || bun install

# Copy source
COPY . .

# Expose port
ENV PORT=3003
EXPOSE 3003

# Start the server
CMD ["bun", "run", "dev"]
