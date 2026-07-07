FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.agent.json ./
COPY agent ./agent
COPY lib/conversation-scenario.js ./lib/conversation-scenario.js
RUN npm run build:agent

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/agent ./agent
COPY --from=build /app/lib ./lib
CMD ["node", "--experimental-strip-types", "agent/index.ts", "start"]
