# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build

COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.agent.json ./
COPY agent ./agent
COPY lib ./lib
RUN npm run build:agent

FROM base AS runtime

ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/agent ./agent
COPY --from=build /app/lib ./lib
RUN chown -R node:node /app
USER node
CMD ["node", "--experimental-strip-types", "agent/index.ts", "start"]
