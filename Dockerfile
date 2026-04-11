FROM docker.io/library/node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY packages ./packages
COPY tests ./tests

RUN npm ci

ENV NODE_ENV=production
ENV AGENTCHAT_PORT=43110
ENV AGENTCHAT_HOST=0.0.0.0
ENV AGENTCHAT_DB_PATH=/data/agentchat.sqlite

EXPOSE 43110

CMD ["npm", "run", "dev:server"]
