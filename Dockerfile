FROM node:20-slim AS frontend-builder
WORKDIR /app/webui
COPY webui/package*.json ./
RUN npm install
COPY webui/ .
RUN npm run build

FROM rust:1.94-slim AS backend-builder
WORKDIR /app
RUN apt-get update && apt-get install -y \
    pkg-config libssl-dev g++ cmake make libopus-dev && \
    rm -rf /var/lib/apt/lists/*
COPY . .
COPY --from=frontend-builder /app/webui/dist ./webui/dist
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y \
    libssl3 \
    ca-certificates \
    libopus0 \
    curl && \
    rm -rf /var/lib/apt/lists/*

COPY --from=backend-builder /app/target/release/lamus ./LaMus
COPY --from=backend-builder /app/webui/dist ./webui/dist

CMD ["./LaMus"]
