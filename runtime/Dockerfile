FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY web ./web
COPY test/live-smoke.ts ./test/live-smoke.ts
ENV NODE_ENV=production
USER 501:20
EXPOSE 18084
CMD ["node", "server/main.ts"]
