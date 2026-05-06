# Stage 1: Build Frontend (React + Vite)
FROM node:20-slim AS frontend-builder
WORKDIR /app/webui
COPY webui/package*.json ./
RUN npm install
COPY webui/ .
# Vite will automatically pick up VITE_API_URL from the .env file
RUN npm run build

# Stage 2: Build Backend (Rust)
FROM rust:1.94-slim AS backend-builder
WORKDIR /app
RUN apt-get update && apt-get install -y \
    pkg-config libssl-dev g++ cmake make libopus-dev && \
    rm -rf /var/lib/apt/lists/*
COPY . .
COPY --from=frontend-builder /app/webui/dist ./webui/dist
RUN cargo build --release

# Stage 3: Production Runtime
FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y \
    libssl3 \
    ca-certificates \
    libopus0 && \
    rm -rf /var/lib/apt/lists/*

COPY --from=backend-builder /app/target/release/lamus ./LaMus
COPY --from=backend-builder /app/webui/dist ./webui/dist

CMD ["./LaMus"]