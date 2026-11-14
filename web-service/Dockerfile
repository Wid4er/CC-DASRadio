# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS validate
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY biome.json ./
COPY src ./src
COPY public ./public
COPY test ./test
RUN npm run lint && npm test

FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=validate --chown=node:node /app/package.json ./
COPY --from=validate --chown=node:node /app/src ./src
COPY --from=validate --chown=node:node /app/public ./public
USER 1000:1000
EXPOSE 8080
CMD ["node", "src/server.mjs"]
